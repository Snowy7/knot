# knot

## Product vision

`knot` is not meant to be another terminal with better pane splitting.

It is meant to be a workspace operating layer for parallel agentic work, where a single project may have 5 to 8 active terminals, agents, logs, or long-running processes at the same time without destroying readability through equal splits.

The central thesis is:

> Parallel agent work should be managed by attention, state, and orchestration, not by dividing the screen into smaller rectangles.

Traditional terminal layouts assume:

- every pane deserves persistent visibility
- splitting the screen is the main primitive
- the user is manually responsible for remembering what each pane is doing
- all processes are peers with equal UI weight

For agentic work, these assumptions are weak.

In real workflows:

- one or two terminals usually matter right now
- several others need monitoring but not full-size visibility
- some terminals are blocked and only matter when they need input
- some are background processes, test runners, logs, or research agents
- the user needs a clear model of what is active, blocked, risky, or complete

`knot` is designed around that reality.

## Core idea

Each project is a persistent workspace.

Inside a workspace:

- each agent or process gets its own real terminal session
- only the currently relevant session is shown at full size
- the rest remain live in the background with status, previews, and events
- the interface promotes what needs attention instead of statically showing everything at once

The product should feel closer to:

- a tiling window manager for agent sessions
- a mission control system for project-local terminals
- a command center for parallel software execution

It should not feel like:

- a prettier tmux clone
- another tabbed terminal
- a standard split-pane IDE terminal

## Primary user problem

A serious coding workflow with parallel agents creates several simultaneous streams:

- planner agent
- implementation agent
- test runner
- logs
- server
- research agent
- review agent
- deployment or ops process

The user loses efficiency because:

- split panes get too small
- important state gets buried
- blocked agents are not surfaced clearly
- project context is scattered
- switching between terminals is manual and brittle
- restoring a full project work session is painful

`knot` should solve this by making the workspace itself the main product object.

## Experience goals

The product should feel:

- calm under heavy concurrency
- dense without being cramped
- operational, not decorative
- fast to navigate with keyboard-first controls
- trustworthy in how it preserves and restores state
- opinionated about attention, not neutral about layout

It should make the user feel like they are coordinating a small execution cluster, not babysitting a pile of shells.

## Interaction model

### 1. Workspace-first model

One repository or project maps to one workspace.

A workspace contains:

- named sessions
- role metadata
- branch/task metadata
- status metadata
- layout state
- history and recent events

Opening a project should restore its last known working context immediately.

### 2. Focused terminal model

The main canvas shows one terminal at full readability.

This is the current focus terminal. It should be large, clear, and optimized for actual work.

The focused terminal is where the user:

- types
- reviews large logs
- inspects errors
- interacts with an agent
- follows a running task in detail

This is the opposite of shrinking everything to fit.

### 3. Attention rail

Non-focused sessions remain alive in a side rail or secondary region.

Each session preview should show:

- role name
- short activity summary
- status
- urgency
- branch or task
- most recent output snippet

The rail is not just navigation. It is a live attention model.

### 4. Event stream

The user often needs awareness more than simultaneous raw output.

So the product should include a unified event feed that surfaces:

- agent completed task
- tests failed
- server recovered
- logs spiked
- agent is waiting for input
- branch diverged
- retry recommended

From the feed, the user should jump directly into the relevant session.

### 5. Compare mode

Sometimes two sessions need simultaneous inspection.

Examples:

- compare two agents implementing different approaches
- compare failing tests vs app logs
- compare planner instructions vs implementation output

This should be a deliberate temporary mode, not the default layout.

### 6. Mission control view

The user should be able to open an overview that shows all live sessions for the project at once as readable cards or mini-terminals.

This is for:

- scanning health
- switching quickly
- reprioritizing
- spotting blocked or idle sessions

Then the UI should snap back into a focused mode.

## Product principles

### Attention over geometry

The interface should decide what deserves space based on importance and urgency, not based on a static pane tree.

### Persistent state over ephemeral layout

Workspaces should remember:

- session names
- roles
- commands
- repo roots
- layout state
- pinned sessions
- paused sessions
- event history

### Roles over anonymous shells

Every terminal should have a purpose.

Examples:

- planner
- coder-a
- coder-b
- tests
- logs
- server
- deploy
- review

This makes the workspace legible.

### Promote changes, collapse silence

Quiet sessions should remain visible in compact form.
Important sessions should be promoted when they need attention.

The UI should help the user notice what changed.

### Keyboard-first control

This product should be navigable almost entirely without a mouse.

Examples:

- cycle focus
- jump by role
- open mission control
- enter compare mode
- send command to selected session
- broadcast to grouped sessions
- reopen last urgent session

### Project-local swarm orchestration

The product should understand that all sessions belong to a single working unit: the project.

The user should not be building layouts manually from scratch every time.

## MVP definition

The MVP should prove the interaction model, not terminal backend completeness.

The MVP should include:

- persistent project workspaces
- a focused terminal canvas
- an attention rail of live sessions
- status labels such as running, blocked, queued, idle, error, needs-input
- compare mode
- mission control overview
- event feed
- workspace templates for common project setups

Example templates:

- full swarm
- frontend train
- backend + tests
- incident / ops watch

The MVP does not need:

- plugin system
- collaborative multi-user mode
- remote orchestration
- advanced theming
- public API surface

## Long-term product direction

### Phase 1: UI and workflow validation

Goal:
Validate that users prefer attention-based terminal management over split panes for parallel agent workflows.

Deliverables:

- clickable prototype
- basic keyboard model
- realistic workspace concepts
- user testing with developers running 4 to 8 active sessions

Success criteria:

- users understand the model quickly
- users can switch sessions faster than with tabs/splits
- users report lower cognitive load

### Phase 2: Real terminal sessions

Goal:
Replace mocked content with actual PTY-backed sessions.

Deliverables:

- local PTY process management
- terminal rendering integration
- session lifecycle controls
- restore and reconnect behavior
- command execution per role

Technical requirements:

- reliable PTY creation and cleanup
- scrollback handling
- text selection and copy
- input routing
- shell compatibility

### Phase 3: Workspace persistence

Goal:
Make project workspaces durable and resumable.

Deliverables:

- auto-save workspace state
- reopen last active project state
- save templates by repo type
- branch-aware restore logic
- recent history and event recall

This phase is where `knot` starts becoming sticky.

### Phase 4: Agent-aware orchestration

Goal:
Turn a collection of terminals into a coordinated agent system.

Deliverables:

- session roles and metadata
- task labels
- attention scoring
- automatic session promotion
- grouped commands
- targeted prompts to a specific agent role
- blocked-session detection

This is where the product becomes more than a shell manager.

### Phase 5: Deep workflow tooling

Goal:
Own the actual multi-agent development loop.

Possible features:

- branch-per-agent workflows
- session-to-git-branch mapping
- diff summaries per agent
- task handoff history
- test and deploy gates
- logs attached to specific tasks
- quick compare between agent outputs
- replay of a workspace timeline

At this point the workspace becomes a first-class execution surface for development teams and solo builders.

### Phase 6: Advanced system

Potential long-term expansion:

- remote agents and remote terminals
- cloud-backed workspace sync
- team-shared incident rooms
- policy-driven agent routing
- plugin SDK
- LSP and editor integration
- structured output channels beyond plain terminal text

This phase should only happen after the core interaction model is undeniably useful.

## Suggested technical architecture

The architecture should separate:

- terminal runtime
- workspace state model
- attention/event model
- UI rendering
- persistence

A likely architecture:

### UI shell

Responsible for:

- rendering focused view
- attention rail
- compare mode
- mission control
- keyboard controls

### Terminal session manager

Responsible for:

- spawning PTYs
- tracking process state
- managing scrollback
- reconnecting sessions
- surfacing exit codes and errors

### Workspace engine

Responsible for:

- project/session definitions
- roles and metadata
- template expansion
- current layout mode
- pinned/promoted state
- restore snapshots

### Event engine

Responsible for:

- converting raw session changes into meaningful events
- tracking urgency and attention
- summarizing noisy outputs
- feeding the UI with state changes

### Persistence layer

Responsible for:

- saving workspace state locally
- restoring sessions and layouts
- caching recent session metadata

## Non-goals

`knot` should not become:

- a general-purpose IDE
- an infinitely configurable layout toy
- a skin over tmux with no new workflow model
- a product that assumes every user wants visible panes at all times

The product wins only if it creates a better mental model for parallel execution.

## Short pitch

`knot` is a terminal workspace manager for parallel agentic development.

Instead of shrinking 5 to 8 terminals into unreadable splits, it keeps one terminal in focus, keeps the rest live in an attention rail, surfaces important events, and restores entire project workspaces as a single operational unit.

## Build priority

If resources are limited, prioritize in this order:

1. Focused terminal + attention rail
2. Real PTY sessions
3. Workspace persistence
4. Event stream and attention scoring
5. Compare mode and mission control
6. Agent-aware orchestration

## Standard for success

The product is successful when a developer running many concurrent agents says:

“I no longer feel like I’m juggling terminals. I feel like I’m directing work.”
