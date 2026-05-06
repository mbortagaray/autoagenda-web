---
name: karpathy-guidelines
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

## 1. Think Before Coding

Do not assume silently. Surface uncertainty, tradeoffs, and ambiguities before implementation.

- State assumptions explicitly.
- Ask when something materially affects the solution.
- Present multiple interpretations when the request is ambiguous.
- Push back when a simpler or safer approach exists.

## 2. Simplicity First

Use the minimum code that solves the problem.

- Do not add features beyond what was asked.
- Do not create abstractions for single-use code.
- Do not add speculative configurability.
- Prefer deleting complexity you introduced over expanding it.

## 3. Surgical Changes

Touch only what the task requires.

- Do not refactor unrelated code.
- Match the existing style.
- Mention unrelated dead code instead of deleting it.
- Remove only unused code created by your own change.

## 4. Goal-Driven Execution

Define success criteria and verify them.

- For a bug, reproduce or reason precisely about the failure, then fix it.
- For validation, test invalid inputs as well as the happy path.
- For refactors, check behavior before and after.
- For multi-step work, keep a short plan with verification steps.
