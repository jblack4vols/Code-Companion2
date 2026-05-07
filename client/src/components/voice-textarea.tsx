import { forwardRef, useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Mic, MicOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// Minimal Web Speech API typings (the browser globals aren't in the default
// TS lib). Both Chrome (Android) and webkit (iOS Safari 14.5+) support this.
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

interface VoiceTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** When true (default) the mic button is rendered if the browser supports it. */
  voice?: boolean;
}

/**
 * Textarea with an optional mic button that appends speech-to-text into
 * the textarea using the Web Speech API. Falls back to a plain Textarea
 * (no mic) on browsers without SpeechRecognition support.
 *
 * Works with uncontrolled forms (FormData reads `name=`) by mutating the
 * textarea's value via ref and dispatching a native input event so React
 * sees it.
 */
export const VoiceTextarea = forwardRef<HTMLTextAreaElement, VoiceTextareaProps>(
  function VoiceTextarea({ voice = true, className, ...props }, externalRef) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const recogRef = useRef<SpeechRecognitionInstance | null>(null);
    const baseValueRef = useRef<string>("");
    const [listening, setListening] = useState(false);
    const [supported, setSupported] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
      setSupported(getRecognitionCtor() !== null);
    }, []);

    // Tear down any active recognition when the component unmounts.
    useEffect(() => () => recogRef.current?.stop(), []);

    function setRefs(el: HTMLTextAreaElement | null) {
      innerRef.current = el;
      if (typeof externalRef === "function") externalRef(el);
      else if (externalRef) (externalRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }

    function appendTranscript(text: string) {
      const el = innerRef.current;
      if (!el) return;
      const next = (baseValueRef.current ? baseValueRef.current + " " : "") + text;
      // Use the native value setter so React's onChange sees the update.
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeSetter?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function startListening() {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        toast({ title: "Voice input not supported", description: "Use the keyboard mic key instead.", variant: "destructive" });
        return;
      }
      baseValueRef.current = innerRef.current?.value ?? "";
      const recog = new Ctor();
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";
      let finalText = "";
      recog.onresult = (e: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) finalText += transcript;
          else interim += transcript;
        }
        appendTranscript((finalText + " " + interim).trim());
      };
      recog.onerror = () => {
        setListening(false);
        toast({ title: "Voice input error", description: "Microphone access denied or unavailable.", variant: "destructive" });
      };
      recog.onend = () => setListening(false);
      try {
        recog.start();
        recogRef.current = recog;
        setListening(true);
      } catch {
        setListening(false);
      }
    }

    function stopListening() {
      recogRef.current?.stop();
      setListening(false);
    }

    return (
      <div className="relative">
        <Textarea
          ref={setRefs}
          className={`${listening ? "pr-12" : voice && supported ? "pr-12" : ""} ${className ?? ""}`}
          {...props}
        />
        {voice && supported && (
          <Button
            type="button"
            size="icon"
            variant={listening ? "default" : "ghost"}
            className={`absolute top-1.5 right-1.5 h-9 w-9 ${listening ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
            onClick={listening ? stopListening : startListening}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            data-testid="button-voice-input"
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
        )}
      </div>
    );
  },
);
