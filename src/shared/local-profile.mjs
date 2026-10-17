// A stable device-local namespace for files. This is not a cloud account/token.
export const LOCAL_ACCOUNT = 'local@climb.local';
export const LOCAL_SNAPSHOT = Object.freeze({ status: 'loggedIn', email: LOCAL_ACCOUNT, local: true });
