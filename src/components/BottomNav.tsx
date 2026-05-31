import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardCircleIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import React from "react";
import { View } from "../types";

interface BottomNavProps {
  view: View;
  onViewChange: (view: View) => void;
}

export default function BottomNav({ view, onViewChange }: BottomNavProps) {
  return (
    <div className="absolute bottom-0 left-0 w-full h-[56px] bg-black border-t border-zinc-900/80 flex justify-center gap-16 text-zinc-500 text-[9px] uppercase font-semibold">
      <button
        onClick={() => onViewChange("home")}
        className={`transition-colors flex flex-col items-center justify-center gap-1 ${view === "home" ? "text-white" : "hover:text-zinc-300"}`}
      >
        <img src="/logo.svg" alt="Phantom" className="w-6 h-6" />
        <span>Vault</span>
      </button>
      <button
        onClick={() => onViewChange("dashboard")}
        className={`transition-colors flex flex-col items-center justify-center gap-1 ${view === "dashboard" ? "text-white" : "hover:text-zinc-300"}`}
      >
        <HugeiconsIcon icon={DashboardCircleIcon} className="w-5 h-5" />
        <span>Audit</span>
      </button>
      <button
        onClick={() => onViewChange("settings")}
        className={`transition-colors flex flex-col items-center justify-center gap-1 ${view === "settings" ? "text-white" : "hover:text-zinc-300"}`}
      >
        <HugeiconsIcon icon={Settings01Icon} className="w-5 h-5" />
        <span>Settings</span>
      </button>
    </div>
  );
}
