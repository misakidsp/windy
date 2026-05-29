import type { SftpConnectionForm } from "./types";

export function createEmptySftpForm(): SftpConnectionForm {
  return {
    profileId: null,
    name: "",
    host: "",
    port: "22",
    username: "",
    authKind: "password",
    password: "",
    privateKeyPath: "",
    passphrase: "",
    remotePath: "/",
    saveProfile: true,
  };
}
