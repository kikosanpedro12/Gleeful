import FeedbackForm from "./FeedbackForm";

export default function FeedbackPage() {
  return (
    <main className="auth">
      <a href="/">← Gleeful</a>
      <h1>Send feedback</h1>
      <p>Something confusing, broken, or missing? Tell us. We read the messages we get.</p>
      <FeedbackForm />
      <small className="fine">Early-access version. <a href="/privacy">Privacy notice</a>.</small>
    </main>
  );
}
