export function HelpPage() {
  return (
    <div className="t1-help-page t1-animate-in">
      <div className="t1-help-header">
        <h1>Help & Support</h1>
        <p>Everything you need to get the most out of OneChat AI Assistant.</p>
      </div>

      <div className="t1-help-grid">
        <section className="t1-help-card">
          <div className="t1-help-card-icon">💡</div>
          <h2>Have an idea or improvement?</h2>
          <p>
            We love hearing from our customers. If you have a suggestion or feature request,
            raise it in our Customer Community Forum — your ideas help shape the product roadmap.
          </p>
          <a
            href="https://customercommunity.technology1.com/s/bridea/acideasULT__brIdea__c/00BOZ00000B6qyT2AR"
            target="_blank"
            rel="noreferrer"
            className="t1-help-btn"
          >
            Raise an idea →
          </a>
        </section>

        <section className="t1-help-card">
          <div className="t1-help-card-icon">🎓</div>
          <h2>Training & Learning</h2>
          <p>
            Need to brush up on a topic or explore new features? Access on-demand training videos
            and learning paths through TechnologyOne University.
          </p>
          <a
            href="https://t1u.t1cloud.com/learner-dashboard"
            target="_blank"
            rel="noreferrer"
            className="t1-help-btn"
          >
            Go to training videos →
          </a>
        </section>
      </div>
    </div>
  );
}
