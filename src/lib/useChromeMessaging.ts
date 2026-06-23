import { useEffect } from "react";
import { VaultItem } from "../types";
import { decrypt } from "./crypto";

interface PendingCredential {
  url: string;
  username: string;
  password: string;
  timestamp: number;
}

interface PendingNote {
  url: string;
  text: string;
  timestamp: number;
}

interface UseChromeMessagingOptions {
  items: VaultItem[];
  masterPassword: string;
  onPendingCredential: (cred: PendingCredential) => void;
  onPendingNote: (note: PendingNote) => void;
}

function matchDomain(website: string, domain: string): boolean {
  const w = website.toLowerCase();
  const d = domain.toLowerCase();
  if (w.includes(d) || d.includes(w)) return true;
  try {
    const host = new URL(w.startsWith("http") ? w : `https://${w}`).hostname;
    return host.includes(d) || d.includes(host);
  } catch {
    return false;
  }
}

export function useChromeMessaging({
  items,
  masterPassword,
  onPendingCredential,
  onPendingNote,
}: UseChromeMessagingOptions) {
  useEffect(() => {
    const checkStorage = () => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return;
      chrome.storage.local.get(
        ["phantom_pending_credential", "phantom_pending_note"],
        (result: Record<string, unknown>) => {
          if (result.phantom_pending_credential) {
            const cred = result.phantom_pending_credential as PendingCredential;
            if (cred.url && cred.timestamp && Date.now() - cred.timestamp < 5 * 60 * 1000) {
              onPendingCredential(cred);
            }
            chrome.storage.local.remove("phantom_pending_credential");
          }
          if (result.phantom_pending_note) {
            const note = result.phantom_pending_note as PendingNote;
            if (note.url && note.timestamp && Date.now() - note.timestamp < 5 * 60 * 1000) {
              onPendingNote(note);
            }
            chrome.storage.local.remove("phantom_pending_note");
          }
        }
      );
    };

    checkStorage();

    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

    const messageListener = (msg: { type: string }) => {
      if (msg.type === "PROMPT_SAVE_PASSWORD" || msg.type === "PROMPT_SAVE_NOTE") {
        checkStorage();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;

    const credentialListener = (
      msg: { type: string; domain?: string; username?: string; password?: string },
      _sender: unknown,
      sendResponse: (response: Record<string, unknown>) => void
    ) => {
      if (msg.type === "REQUEST_CREDENTIALS") {
        if (!masterPassword) {
          sendResponse({ success: false, locked: true });
          return true;
        }

        const domain = msg.domain || "";
        const matchedCredentials = items
          .filter((item) => {
            if (item.category !== "Login" || !item.website) return false;
            return matchDomain(item.website, domain);
          });

        Promise.all(
          matchedCredentials.map(async (item) => {
            try {
              const password = await decrypt(item.encryptedPassword, masterPassword);
              return {
                id: item.id,
                title: item.title,
                username: item.username,
                password,
              };
            } catch {
              return null;
            }
          })
        ).then((results) => {
          sendResponse({ success: true, credentials: results.filter(Boolean) });
        });

        return true;
      }

      if (msg.type === "CHECK_CREDENTIAL_EXISTS") {
        if (!masterPassword) {
          sendResponse({ exists: false, locked: true });
          return true;
        }

        const domain = msg.domain || "";
        const username = msg.username || "";
        const password = msg.password || "";

        (async () => {
          for (const item of items) {
            if (item.category !== "Login" || !item.website) continue;
            if (!matchDomain(item.website, domain)) continue;
            if (item.username !== username) continue;

            try {
              const decrypted = await decrypt(item.encryptedPassword, masterPassword);
              if (decrypted === password) {
                sendResponse({ exists: true, locked: false });
                return;
              }
            } catch {}
          }
          sendResponse({ exists: false, locked: false });
        })();

        return true;
      }
    };

    chrome.runtime.onMessage.addListener(credentialListener);
    return () => chrome.runtime.onMessage.removeListener(credentialListener);
  }, [items, masterPassword]);
}
