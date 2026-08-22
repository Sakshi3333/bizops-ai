import { useState, type FormEvent } from "react";
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

  return (
    <AppLayout>
      <div className="assistant-page">
        <h1>Ask your data</h1>
        <p className="muted-text">
          Ask a question in plain English. The assistant only answers from your company's real
          data — it can't see or invent numbers it didn't look up.
        </p>

        <form onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. What's my outstanding revenue?"
            rows={3}
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Thinking..." : "Ask"}
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

        {result && (
          <div className="assistant-answer">
            <p>{result.answer}</p>
            {result.tools_used.length > 0 && (
              <div className="assistant-tools-used">
                <span className="muted-text">Data used:</span>
                <ul>
                  {result.tools_used.map((t, i) => (
                    <li key={i}>
                      <code>{t.tool}</code> — {t.summary}
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
