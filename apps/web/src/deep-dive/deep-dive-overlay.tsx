import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Loader2, MessageSquare, Send, Sparkles, Star, X } from "lucide-react";
import type { DeepDiveSession, WorkItemCard } from "@hepha/shared";

export function DeepDiveOverlay({
  onAnswer,
  onChat,
  onClose,
  onComplete,
  pendingAction,
  session,
}: {
  onAnswer: (questionId: string, selectedOptionId: string, answerText: string) => void;
  onChat: (questionId: string, message: string) => void;
  onClose: () => void;
  onComplete: () => void;
  pendingAction: string | null;
  session: DeepDiveSession;
}) {
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [chatText, setChatText] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());
  const activeQuestion = useMemo(
    () => session.questions.find((question) => question.id === activeQuestionId) ?? null,
    [activeQuestionId, session.questions],
  );
  const answeredCount = session.questions.filter((question) => question.status === "answered").length;
  const allAnswered = session.questions.length > 0 && answeredCount === session.questions.length;
  const isGenerating = session.status === "generating_questions";
  const isEvaluatingFollowUp = isGenerating && answeredCount > 0;
  const isUpdating = pendingAction === "complete" || session.status === "updating_document";
  const hasFailed = session.status === "failed";
  const itemLabel = formatWorkItemKind(session.cardKind);
  const generationElapsed = formatElapsedDuration(currentTimeMs - Date.parse(session.createdAt));

  useEffect(() => {
    if (!isGenerating) return;
    setCurrentTimeMs(Date.now());
    const timer = window.setInterval(() => setCurrentTimeMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [isGenerating, session.id]);

  useEffect(() => {
    setActiveQuestionId((currentQuestionId) => {
      if (currentQuestionId && session.questions.some(
        (question) => question.id === currentQuestionId && question.status === "pending",
      )) {
        return currentQuestionId;
      }

      return (
        session.questions.find((question) => question.status === "pending")?.id ??
        session.questions[0]?.id ??
        null
      );
    });
  }, [session.questions]);

  useEffect(() => {
    if (!activeQuestion) {
      setAnswerText("");
      setChatText("");
      setSelectedOptionId("");
      return;
    }

    setAnswerText(activeQuestion.answerText ?? "");
    setChatText("");
    setSelectedOptionId(activeQuestion.selectedOptionId ?? "");
  }, [activeQuestion]);

  function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeQuestion || !selectedOptionId) {
      return;
    }

    onAnswer(activeQuestion.id, selectedOptionId, answerText.trim());
  }

  function submitChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeQuestion || !chatText.trim()) {
      return;
    }

    onChat(activeQuestion.id, chatText.trim());
    setChatText("");
  }

  return (
    <div className="deep-dive-backdrop" role="presentation">
      <section className="deep-dive-modal" role="dialog" aria-modal="true" aria-labelledby="deep-dive-title">
        <header className="deep-dive-header">
          <div>
            <span className="deep-dive-kicker">
              <Sparkles size={14} aria-hidden="true" />
              {itemLabel} Deep-Dive
            </span>
            <h2 id="deep-dive-title">{session.cardTitle}</h2>
            <div className="deep-dive-meta">
              <span>{session.cardExternalId}</span>
              <span>{formatSessionStatus(session.status)}</span>
              <span>{formatAgentStatus(session.agentConnectionStatus)}</span>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title={isUpdating ? "Close this overlay; the update continues in the background." : "Close deep-dive"}
            type="button"
            aria-label="Close deep-dive"
          >
            <X size={19} />
          </button>
        </header>

        <div className="deep-dive-progress">
          <span>
            {answeredCount}/{session.questions.length} answered
          </span>
          <div>
            <span style={{ width: `${session.questions.length ? (answeredCount / session.questions.length) * 100 : 0}%` }} />
          </div>
        </div>

        {isGenerating ? (
          <div className="deep-dive-status-panel" role="status" aria-live="polite">
            <Loader2 className="spin-icon" size={34} aria-hidden="true" />
            <h3>{isEvaluatingFollowUp ? "Evaluating answer and follow-up" : `Generating ${itemLabel} questions`}</h3>
            <p>
              {isEvaluatingFollowUp
                ? "Hepha is checking the saved decision for an immediate dependent question before moving to the next topic."
                : `Hepha is reading the source Markdown and asking the Requirements Agent for the decision points needed before this ${itemLabel} can move forward.`}
            </p>
            <span>
              Elapsed: {generationElapsed}. This continues in the background if you close the dialog;
              Hepha will stop and report a failure if agent progress stalls.
            </span>
          </div>
        ) : isUpdating ? (
          <div className="deep-dive-status-panel" role="status" aria-live="polite">
            <Loader2 className="spin-icon" size={34} aria-hidden="true" />
            <h3>Updating {itemLabel} document</h3>
            <p>
              Hepha is sending the original Markdown and saved decisions to the model, then writing the
              revised {itemLabel} file to disk. This can take a few minutes.
            </p>
            <span>You can close this overlay; the update will continue and the board will refresh.</span>
          </div>
        ) : hasFailed ? (
          <div className="deep-dive-status-panel deep-dive-status-error" role="status" aria-live="polite">
            <AlertTriangle size={34} aria-hidden="true" />
            <h3>Deep-Dive step failed</h3>
            <p>
              Hepha could not finish question generation, adaptive follow-up, or document update.
              Saved decisions remain durable; close this dialog and use the workflow recovery details before retrying.
            </p>
            <button className="deep-dive-secondary" onClick={onClose} type="button">
              Close
            </button>
          </div>
        ) : (
        <div className="deep-dive-body">
          <nav className="deep-dive-topic-list" aria-label="Deep-dive topics">
            {session.questions.map((question, index) => (
              <button
                className={question.id === activeQuestion?.id ? "topic-row topic-row-active" : "topic-row"}
                key={question.id}
                onClick={() => setActiveQuestionId(question.id)}
                type="button"
              >
                <span>{question.status === "answered" ? <CheckCircle2 size={14} /> : index + 1}</span>
                <strong>{question.topic}</strong>
                <em>{question.parentQuestionId ? `follow-up · ${question.status}` : question.status}</em>
              </button>
            ))}
          </nav>

          {activeQuestion ? (
            <div className="deep-dive-question-pane">
              <form className="deep-dive-answer-form" onSubmit={submitAnswer}>
                <div className="question-title-row">
                  <span>{activeQuestion.topic}</span>
                  <em>{activeQuestion.status}</em>
                </div>
                <p className="deep-dive-prompt">{activeQuestion.prompt}</p>
                <p className="deep-dive-hint">
                  Choose one option to answer this topic. Extra detail is optional.
                </p>

                <div className="deep-dive-options" role="radiogroup" aria-label="Answer options">
                  {activeQuestion.options.map((option) => (
                    <button
                      aria-checked={selectedOptionId === option.id}
                      className={
                        selectedOptionId === option.id
                          ? "deep-dive-option deep-dive-option-selected"
                          : "deep-dive-option"
                      }
                      key={option.id}
                      onClick={() => setSelectedOptionId(option.id)}
                      role="radio"
                      type="button"
                    >
                      <strong>
                        {option.label}
                        {activeQuestion.recommendedOptionId === option.id ? (
                          <span className="option-recommendation">
                            <Star size={12} aria-hidden="true" />
                            Hepha recommends
                          </span>
                        ) : null}
                      </strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>

                <label className="deep-dive-textarea">
                  <span>Optional extra detail</span>
                  <textarea
                    onChange={(event) => setAnswerText(event.target.value)}
                    placeholder="Add context only if the chosen option needs more detail."
                    value={answerText}
                  />
                </label>

                <button
                  className="deep-dive-primary"
                  disabled={!selectedOptionId || pendingAction === `answer-${activeQuestion.id}`}
                  type="submit"
                >
                  {pendingAction === `answer-${activeQuestion.id}` ? (
                    <Loader2 className="spin-icon" size={15} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  )}
                  {pendingAction === `answer-${activeQuestion.id}` ? "Saving Decision" : "Save Decision"}
                </button>
              </form>

              <section className="deep-dive-chat" aria-label="Topic chat">
                <div className="question-title-row">
                  <span>
                    <MessageSquare size={14} aria-hidden="true" />
                    Chat about this topic
                  </span>
                  <em>{activeQuestion.chatMessages.length} messages</em>
                </div>
                <div className="chat-transcript">
                  {activeQuestion.chatMessages.length === 0 ? (
                    <div className="empty-inline">Ask a focused clarification before choosing an answer.</div>
                  ) : (
                    activeQuestion.chatMessages.map((message) => (
                      <div className={`chat-message chat-message-${message.role}`} key={message.id}>
                        <strong>{message.role === "assistant" ? "Hepha" : "You"}</strong>
                        <p>{message.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <form className="chat-form" onSubmit={submitChat}>
                  <textarea
                    onChange={(event) => setChatText(event.target.value)}
                    placeholder="Ask Hepha to clarify tradeoffs or wording."
                    value={chatText}
                  />
                  <button
                    className="deep-dive-secondary"
                    disabled={!chatText.trim() || pendingAction === `chat-${activeQuestion.id}`}
                    type="submit"
                  >
                    <Send size={14} aria-hidden="true" />
                    {pendingAction === `chat-${activeQuestion.id}` ? "Sending" : "Send"}
                  </button>
                </form>
              </section>
            </div>
          ) : (
            <div className="empty-inline">No deep-dive questions were generated for this {itemLabel}.</div>
          )}
        </div>
        )}

        <footer className="deep-dive-footer">
          <span>
            {isGenerating
              ? `The ${itemLabel} Deep-Dive workflow is generating questions.`
              : isUpdating
              ? `The ${itemLabel} update is running. The board will refresh when the server responds.`
              : "Save one decision for every topic. Completion rewrites the source Markdown and records the Hepha deep-dive in SQLite."}
          </span>
          <button
            className="deep-dive-primary"
            disabled={!allAnswered || isGenerating || isUpdating || session.status === "completed"}
            onClick={onComplete}
            type="button"
          >
            {isGenerating || isUpdating ? (
              <Loader2 className="spin-icon" size={15} aria-hidden="true" />
            ) : (
              <FileText size={15} aria-hidden="true" />
            )}
            {session.status === "completed"
              ? "Document Updated"
              : isGenerating
                ? "Generating Questions"
                : isUpdating
                ? "Updating Document"
                : `Update ${itemLabel} Document`}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function formatElapsedDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatWorkItemKind(kind: WorkItemCard["kind"]) {
  return kind === "epic" ? "EPIC" : "FEAT";
}

export function formatSessionStatus(status: DeepDiveSession["status"]) {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "generating_questions":
      return "Generating Questions";
    case "question_round":
      return "Question Round";
    case "ready_for_update":
      return "Ready For Update";
    case "updating_document":
      return "Updating Document";
  }
}

export function formatAgentStatus(status: DeepDiveSession["agentConnectionStatus"]) {
  switch (status) {
    case "active":
      return "Pi agent active";
    case "finished":
      return "Pi agent finished";
    case "hepha_chat":
      return "Hepha chat fallback";
    case "lost":
      return "Pi connection lost";
  }
}
