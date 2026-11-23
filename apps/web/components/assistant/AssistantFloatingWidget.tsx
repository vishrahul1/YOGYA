"use client";

import { useState } from "react";
import AssistantChat from "@/components/assistant/AssistantChat";

export default function AssistantFloatingWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <section
          aria-label="YOGYA Assistant"
          className="fixed bottom-24 right-4 z-40 flex h-[min(680px,calc(100vh-7rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-2xl md:right-6"
        >
          <AssistantChat schemeVersionId={null} compact />
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close YOGYA Assistant" : "Open YOGYA Assistant"}
        className="fixed bottom-5 right-4 z-50 flex min-h-14 items-center gap-2 rounded-full bg-teal-700 px-5 font-semibold text-white shadow-xl transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 md:right-6"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15" aria-hidden="true">{open ? "×" : "Y"}</span>
        {open ? "Close" : "Ask YOGYA"}
      </button>
    </>
  );
}
