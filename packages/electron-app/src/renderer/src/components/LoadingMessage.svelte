<div class="message agent loading-message">
  <div class="message-content">
    <div class="loading-dots">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>
</div>

<style>
  .message {
    max-width: 85%;
    padding: 0;
    margin-bottom: 0;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .message.agent {
    align-self: flex-start;
  }

  .message-content {
    background: var(--message-agent-bg);
    padding: 1rem 1.25rem;
    border-radius: 1rem 1rem 1rem 0.25rem;
    line-height: 1.6;
    font-size: 0.875rem;
    color: var(--message-agent-text);
    box-shadow: 0 1px 2px 0 var(--shadow-light);
    border: 1px solid var(--message-agent-border);
    transition: all 0.2s ease;
  }

  .loading-dots {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.25rem;
  }

  .dot {
    width: 0.375rem;
    height: 0.375rem;
    background: var(--text-muted);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out;
    opacity: 0.4;
  }

  .dot:nth-child(1) {
    animation-delay: 0s;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    40% {
      opacity: 1;
      transform: scale(1.2);
    }
  }
</style>
