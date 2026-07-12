const { RELAY_AUTH_CODES } = require("./protocol");

function createRelayAuth({ token }) {
  function getToken() {
    return token;
  }

  function verifyRequest(req) {
    if (!token) {
      return null;
    }

    const header = req.headers && req.headers.authorization;

    if (!header) {
      return authError(RELAY_AUTH_CODES.RELAY_AUTH_MISSING);
    }

    const parts = header.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return authError(RELAY_AUTH_CODES.RELAY_AUTH_INVALID);
    }

    if (parts[1] !== token) {
      return authError(RELAY_AUTH_CODES.RELAY_AUTH_INVALID);
    }

    return null;
  }

  function authError(code) {
    if (code === RELAY_AUTH_CODES.RELAY_AUTH_MISSING) {
      return {
        code: RELAY_AUTH_CODES.RELAY_AUTH_MISSING,
        message: "Relay authentication token is required.",
        nextStep: "Include an Authorization header with Bearer <token>."
      };
    }

    if (code === RELAY_AUTH_CODES.RELAY_AUTH_INVALID) {
      return {
        code: RELAY_AUTH_CODES.RELAY_AUTH_INVALID,
        message: "Relay authentication token is invalid.",
        nextStep: "Provide the correct pre-shared token in the Authorization header."
      };
    }

    return {
      code: RELAY_AUTH_CODES.RELAY_AUTH_REQUIRED,
      message: "Relay authentication is required.",
      nextStep: "Configure RELAY_TOKEN and provide a valid Bearer token."
    };
  }

  return {
    getToken,
    verifyRequest,
    authError
  };
}

module.exports = {
  createRelayAuth
};
