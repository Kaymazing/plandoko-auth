const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

function safeCallback(value) {
  const url = new URL(value);
  if (
    url.username || url.password ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && loopback.has(url.hostname)))
  ) {
    throw new Error("Invalid OAuth callback");
  }
  return url;
}

function requireData({ data, error }) {
  if (error || !data) throw error ?? new Error("Missing Auth response");
  return data;
}

export class SignInError extends Error {}

// The SDK interpolates this ID into an API path. Accept only a path segment.
export function createConsentFlow(auth, authorizationId, getProfile) {
  let pending = false;

  function checkRequest() {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(authorizationId)) {
      throw new Error("Invalid authorization ID");
    }
  }

  async function details(user) {
    const data = requireData(
      await auth.oauth.getAuthorizationDetails(authorizationId),
    );
    if (data.redirect_url) {
      return { screen: "redirect", url: safeCallback(data.redirect_url).href };
    }
    if (data.authorization_id !== authorizationId || !data.client?.id) {
      throw new Error("Invalid authorization details");
    }
    const redirectHost = safeCallback(data.redirect_uri).host;
    const profile = await getProfile(authorizationId);
    if (profile !== "full" && profile !== "read-only") {
      throw new Error("Missing OAuth permission");
    }
    pending = true;
    return {
      screen: "consent",
      account: user.email,
      client: data.client.name || data.client.id,
      scope: data.scope,
      redirectHost,
      profile,
    };
  }

  return {
    async load() {
      checkRequest();
      const { session } = requireData(await auth.getSession());
      return session ? details(session.user) : { screen: "signin" };
    },
    async signIn(email, password) {
      checkRequest();
      let user;
      try {
        ({ user } = requireData(
          await auth.signInWithPassword({ email, password }),
        ));
      } catch (cause) {
        throw new SignInError("Sign-in failed", { cause });
      }
      return details(user);
    },
    async decide(decision) {
      if (!pending || (decision !== "approve" && decision !== "deny")) {
        throw new Error("No pending consent decision");
      }
      const options = { skipBrowserRedirect: true };
      const response = decision === "approve"
        ? await auth.oauth.approveAuthorization(authorizationId, options)
        : await auth.oauth.denyAuthorization(authorizationId, options);
      const { redirect_url } = requireData(response);
      const url = safeCallback(redirect_url).href;
      pending = false;
      return { screen: "redirect", url };
    },
  };
}
