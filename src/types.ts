export interface VaultItem {
  id: string;
  title: string;
  website: string;
  username: string;
  encryptedPassword: string;
  encryptedTotpSecret?: string;
  category: "Login" | "Note" | "Card" | "Identity";
  isFavorite?: boolean;
  folderId?: string;
  customIcon?: string;
  customIconColor?: string;
  content?: string;
  cardDetails?: {
    number: string;
    expiry: string;
    encryptedCvv?: string;
  };
  identityDetails?: {
    firstName: string;
    lastName: string;
    idNumber: string;
    dob: string;
    address: string;
  };
  passwordHistory?: {
    password: string;
    timestamp: number;
  }[];
  customFields?: {
    id: string;
    name: string;
    value: string;
    isSecret: boolean;
  }[];
  updatedAt: number;
  deletedAt?: number;
  strength?: number;
  tags?: string[];
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string;
  color?: string;
}

export interface EncryptedVault {
  salt: string;
  iv: string;
  content: string;
}

export type View =
  | "unlock"
  | "home"
  | "add"
  | "edit"
  | "preview"
  | "settings"
  | "setup"
  | "dashboard";
