export interface Env {
  HUB_KV?: KVNamespace;
  AUTH_USERNAME: string;
  AUTH_PEPPER: string;
  AUTH_PASSWORD_HASH: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  GDRIVE_ROOT_FOLDER_ID: string;
}

export interface AppVariables {
  user: {
    username: string;
  };
}

