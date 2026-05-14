export interface VaultItem {
  id: string;
  title: string;
  website: string;
  username: string;
  encryptedPassword: string;
  encryptedTotpSecret?: string;
  category: "Login" | "Note" | "Card" | "Identity";
  isFavorite?: boolean;
  folderId?: string; // Hierarchical folder organization
  customIcon?: string; // Custom icon (URL, emoji, or base64 data)
  customIconColor?: string; // Custom background color if no icon
  content?: string; // For Secure Notes (Markdown)
  cardDetails?: {
    number: string;
    expiry: string;
    cvv: string;
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
  deletedAt?: number; // Soft delete timestamp
  strength?: number; // 0-5 score
  tags?: string[];
}

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string; // Allows for hierarchical organization
  color?: string; // Optional folder color
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
  | "generator"
  | "settings"
  | "setup"
  | "dashboard";
