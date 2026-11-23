"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import type { AiLanguage } from "@/lib/api/types";

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}

interface RecognitionResults {
  length: number;
  [index: number]: RecognitionResult;
}

interface RecognitionEvent extends Event {
  results: RecognitionResults;
}

interface RecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export interface VoiceInputButtonProps {
  language: AiLanguage;
  disabled?: boolean;
  onTranscript: (text: string) => void;
}

export default function VoiceInputButton({
  language,
  disabled = false,
  onTranscript,
}: VoiceInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  function startListening() {
    setMessage(null);
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage("Voice input is not supported in this browser. You can still type your message.");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = language === "te" ? "te-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const cleanTranscript = transcript.trim();
      if (cleanTranscript) onTranscript(cleanTranscript);
    };
    recognition.onerror = (event) => {
      const permissionDenied = event.error === "not-allowed" || event.error === "service-not-allowed";
      setMessage(
        permissionDenied
          ? "Microphone access was blocked. Allow it in your browser settings or type your message."
          : "I could not hear that clearly. Please try again or type your message.",
      );
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setMessage("Voice input could not start. Please try again or type your message.");
      recognitionRef.current = null;
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        aria-pressed={listening}
        onClick={listening ? stopListening : startListening}
        className={listening ? "border-red-300 text-red-700 hover:bg-red-50" : ""}
      >
        <span aria-hidden="true" className="mr-2">{listening ? "■" : "●"}</span>
        {listening ? "Stop listening" : "Speak instead"}
      </Button>
      {listening ? (
        <p role="status" className="text-sm font-medium text-teal-700">
          Listening… Speak naturally in {language === "te" ? "Telugu" : "English"}.
        </p>
      ) : null}
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
