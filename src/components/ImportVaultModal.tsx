import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, AlertTriangle, X, CheckCircle2 } from "lucide-react";
import { decrypt, decryptLegacy } from "../lib/crypto";

interface ImportVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vaultData: { items: any[]; folders: any[] }) => void;
}

export default function ImportVaultModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportVaultModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [error, setError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError("");
    }
  };

  const handleImport = async () => {
    if (!file || !oldPassword) {
      setError("Please select a file and enter the password.");
      return;
    }

    setIsImporting(true);
    setError("");

    try {
      const content = await file.text();

      let decrypted: string | null = null;

      try {
        const parsed = JSON.parse(content);
        if (parsed.v === 2) {
          decrypted = await decrypt(content, oldPassword);
        }
      } catch {}

      if (!decrypted) {
        decrypted = await decryptLegacy(content, oldPassword);
      }

      if (!decrypted) {
        setError("Wrong password or corrupted file.");
        setIsImporting(false);
        return;
      }

      const parsed = JSON.parse(decrypted);

      let items: any[] = [];
      let folders: any[] = [];

      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (parsed && typeof parsed === "object") {
        items = parsed.items || [];
        folders = parsed.folders || [];
      }

      if (items.length === 0 && folders.length === 0) {
        setError("Vault file is empty.");
        setIsImporting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess({ items, folders });
      }, 1000);
    } catch (e) {
      setError("Failed to read file. Make sure it's a valid .pv backup.");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setOldPassword("");
    setError("");
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-md"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Import Vault</h3>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {success ? (
              <div className="flex flex-col items-center py-6 space-y-3">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-white">Vault imported!</p>
                <p className="text-xs text-zinc-400 text-center">
                  Your data will be re-encrypted with your new master password.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Select a <span className="text-white font-medium">.pv</span> backup file and enter the password used to create it. Your data will be re-encrypted with your new master password.
                  </p>
                </div>

                {/* File picker */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">
                    Backup File
                  </label>
                  <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors cursor-pointer">
                    <Upload className="w-4 h-4 text-zinc-500" />
                    <span className="text-xs text-zinc-400">
                      {file ? file.name : "Choose .pv file"}
                    </span>
                    <input
                      type="file"
                      accept=".pv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Password input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">
                    Old Master Password
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => {
                      setOldPassword(e.target.value);
                      setError("");
                    }}
                    placeholder="Password used for this backup"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                </div>

                {/* Error message */}
                {error && (
                  <p className="text-xs text-red-400 text-center font-medium">
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2.5 bg-zinc-800 text-white text-xs font-semibold rounded-xl hover:bg-zinc-700 transition-colors border border-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!file || !oldPassword || isImporting}
                    className="flex-1 py-2.5 bg-white text-black text-xs font-semibold rounded-xl hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 transition-colors"
                  >
                    {isImporting ? "Importing..." : "Import"}
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
