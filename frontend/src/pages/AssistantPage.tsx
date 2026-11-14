import { useState, type FormEvent, type KeyboardEvent } from "react";
import Markdown from "react-markdown";
import { ArrowUp, Database, Sparkles } from "lucide-react";
import { apiClient } from "../api/client";
import { extractErrorMessage } from "../api/errors";
import { AppLayout } from "../components/AppLayout";
import type { AskRequest, AskResponse } from "../api/types";

const EXAMPLE_QUESTIONS = [
  "What's my outstanding revenue?",
  "Which customers haven't paid?",
  "What's low on stock?",
  "Who are my top customers by revenue?",
];

export function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: AskRequest = { question: q };
      const { data } = await apiClient.post<AskResponse>("/assistant/ask", body);
      setResult(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  // Enter asks, Shift+Enter adds a new line - the usual chat convention.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!loading) ask(question);
    }
  }

  return (
    <AppLayout>
      <div className="assistant-page">
        <div className="assistant-hero">
          <span className="assistant-hero-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h1>Ask your data</h1>
            <p className="page-subtitle">
              Plain-English questions, answered only from your company's real records - never
              invented numbers.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Which customers haven't paid yet?"
            rows={3}
            aria-label="Your question"
          />
          <span className="assistant-hint">Enter to ask - Shift+Enter for a new line</span>
          <button type="submit" className="btn-primary" disabled={loading || !question.trim()}>
            {loading ? "Thinking..." : "Ask"}
            {!loading && <ArrowUp size={16} />}
          </button>
        </form>

        <div className="assistant-examples">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="assistant-example-chip"
              disabled={loading}
              onClick={() => {
                setQuestion(q);
                ask(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        {loading && (
          <div className="assistant-thinking">
            <span className="spinner" />
            Looking through your data...
          </div>
        )}

        {result && (
          <div className="assistant-answer">
            <div className="assistant-answer-head">
              <Sparkles size={15} />
              Answer
            </div>
            {/* The model answers in Markdown; react-markdown never renders raw HTML. */}
            <div className="assistant-answer-body">
              <Markdown>{result.answer}</Markdown>
            </div>
            {result.tools_used.length > 0 && (
              <div className="assistant-tools-used">
                <Database size={14} className="muted-text" />
                <span className="muted-text">Based on:</span>
                <ul>
                  {result.tools_used.map((t, i) => (
                    <li key={i} title={t.summary}>
                      <code>{t.tool}</code> {t.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
