Feature: Generic Deep-Dive question planning
  Work-item questions use project lessons, progress-based liveness, and fail-closed generation evidence.

  Scenario: The model returns a valid adaptive opening
    Given the work-item source and project lessons are available
    When the Deep-Dive question agent returns exactly one opening question
    Then the normalized question becomes the first pending decision

  Scenario: A compatibility manifest exceeds the former presentation count
    Given the question agent returns every valid unresolved decision
    When the question manifest is normalized for persistence
    Then no valid question is discarded by a presentation count limit

  Scenario: Productive question discovery exceeds the old wall-clock duration
    Given the question agent is still producing observable context and tool progress
    When the former absolute runtime boundary passes
    Then question discovery remains active under the inactivity circuit

  Scenario: Question generation cannot produce a valid manifest
    Given the configured model fails or returns no valid questions
    When the question planner evaluates the result
    Then the Deep-Dive fails visibly without substituting generic Accept current questions
