const workspaces = [
  {
    id: "atlas",
    name: "Atlas",
    repo: "~/work/atlas-core",
    template: "Full swarm",
    spike: "2m ago",
    agents: [
      makeAgent("planner", "Plan API split, queue schema migration, stage agent handoffs.", "needs-input", "feat/workspace-stream"),
      makeAgent("coder-a", "Refactor server bootstrap and keep auth adapter isolated.", "running", "feat/auth-slice"),
      makeAgent("coder-b", "Wiring compare overlay and preserving active focus path.", "running", "feat/focus-rail"),
      makeAgent("tests", "Replay API contract suite against mock and staging outputs.", "queued", "test/contracts"),
      makeAgent("logs", "Streaming edge logs, deploy hooks, and queue failures.", "idle", "ops/live"),
      makeAgent("research", "Collect terminal UX notes and keyboard priority conflicts.", "error", "docs/research")
    ],
    feed: [
      feedItem("coder-b", "Compare mode now mirrors primary focus and secondary selection.", "11:02"),
      feedItem("planner", "Waiting on user input for repo grouping strategy.", "10:59"),
      feedItem("logs", "No new deploy errors in the last 12 minutes.", "10:54"),
      feedItem("research", "Found collision between workspace switch and tmux defaults.", "10:48")
    ]
  },
  {
    id: "rune",
    name: "Rune",
    repo: "~/work/rune-ui",
    template: "Frontend train",
    spike: "7m ago",
    agents: [
      makeAgent("planner", "Split tasks by route, animation pass, and accessibility audit.", "running", "feat/plan-pass"),
      makeAgent("ui", "Building motion-heavy shell with card stack navigation.", "running", "feat/hero-shell"),
      makeAgent("review", "Checking contrast and keyboard flow in mission control.", "needs-input", "chore/review"),
      makeAgent("tests", "Running snapshot and navigation test queue.", "queued", "test/nav"),
      makeAgent("notes", "Summarizing design decisions and copy changes.", "idle", "docs/notes")
    ],
    feed: [
      feedItem("ui", "Main canvas animation landed; waiting on reduced-motion fallback.", "11:11"),
      feedItem("review", "Keyboard trap found in command palette overlay.", "11:06"),
      feedItem("planner", "Reordered workspaces to prioritize shipping path.", "11:01")
    ]
  },
  {
    id: "moss",
    name: "Moss",
    repo: "~/work/moss-data",
    template: "Ops watch",
    spike: "now",
    agents: [
      makeAgent("ingest", "Backfill worker is replaying 14k rows from archive.", "running", "ops/backfill"),
      makeAgent("db", "Examining index pressure after wide workspace restore.", "needs-input", "fix/index-plan"),
      makeAgent("etl", "Queue paused pending schema version match.", "queued", "etl/schema"),
      makeAgent("logs", "P95 latency dipped after job burst normalized.", "idle", "ops/latency"),
      makeAgent("audit", "Comparing failed rows against last clean checkpoint.", "running", "ops/audit")
    ],
    feed: [
      feedItem("db", "Index planner is blocked on cardinality snapshot.", "11:16"),
      feedItem("ingest", "Backfill throughput stable at 1.2k rows/min.", "11:14"),
      feedItem("audit", "Three suspect rows promoted for manual review.", "11:08")
    ]
  }
];

function makeAgent(role, summary, status, branch) {
  return {
    id: `${role}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    summary,
    status,
    branch,
    output: buildOutput(role, summary, status, branch)
  };
}

function feedItem(agent, text, time) {
  return { agent, text, time };
}

function buildOutput(role, summary, status, branch) {
  return [
    `$ pwd`,
    `~/workspace/${branch}`,
    `$ agent run --role ${role}`,
    "",
    `[context] ${summary}`,
    `[status] ${status}`,
    "",
    `${timestamp()} syncing project state`,
    `${timestamp()} replaying recent workspace events`,
    `${timestamp()} prioritizing focused terminal over equal-width splits`,
    `${timestamp()} surfacing attention markers in side rail`,
    `${timestamp()} ready`
  ].join("\n");
}

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const state = {
  workspaceId: workspaces[0].id,
  activeAgentId: workspaces[0].agents[0].id,
  compareAgentId: workspaces[0].agents[1].id,
  view: "focus"
};

const els = {
  projectList: document.getElementById("project-list"),
  projectTitle: document.getElementById("project-title"),
  templateName: document.getElementById("template-name"),
  terminalCount: document.getElementById("terminal-count"),
  attentionSpike: document.getElementById("attention-spike"),
  focusedRole: document.getElementById("focused-role"),
  focusedName: document.getElementById("focused-name"),
  focusedStatus: document.getElementById("focused-status"),
  focusedBranch: document.getElementById("focused-branch"),
  focusedPath: document.getElementById("focused-path"),
  terminalOutput: document.getElementById("terminal-output"),
  agentList: document.getElementById("agent-list"),
  eventFeed: document.getElementById("event-feed"),
  comparePrimaryName: document.getElementById("compare-primary-name"),
  compareSecondaryName: document.getElementById("compare-secondary-name"),
  comparePrimaryOutput: document.getElementById("compare-primary-output"),
  compareSecondaryOutput: document.getElementById("compare-secondary-output"),
  overviewView: document.getElementById("overview-view"),
  needsInputCount: document.getElementById("needs-input-count"),
  runningCount: document.getElementById("running-count"),
  queuedCount: document.getElementById("queued-count"),
  cycleButton: document.getElementById("cycle-button"),
  modeButtons: [...document.querySelectorAll(".mode-toggle")],
  stageViews: {
    focus: document.getElementById("focus-view"),
    compare: document.getElementById("compare-view"),
    overview: document.getElementById("overview-view")
  }
};

function getWorkspace() {
  return workspaces.find((workspace) => workspace.id === state.workspaceId);
}

function getAgent(agentId) {
  return getWorkspace().agents.find((agent) => agent.id === agentId);
}

function renderProjects() {
  els.projectList.innerHTML = "";

  workspaces.forEach((workspace) => {
    const button = document.createElement("button");
    button.className = `project-pill${workspace.id === state.workspaceId ? " active" : ""}`;
    button.innerHTML = `
      <div class="dock-label">${workspace.template}</div>
      <strong>${workspace.name}</strong>
      <span class="agent-role">${workspace.agents.length} active terminals</span>
    `;
    button.addEventListener("click", () => {
      state.workspaceId = workspace.id;
      state.activeAgentId = workspace.agents[0].id;
      state.compareAgentId = workspace.agents[1]?.id || workspace.agents[0].id;
      render();
    });
    els.projectList.appendChild(button);
  });
}

function renderWorkspace() {
  const workspace = getWorkspace();
  const active = getAgent(state.activeAgentId);
  const compare = getAgent(state.compareAgentId) || workspace.agents[1] || active;

  els.projectTitle.textContent = workspace.name;
  els.templateName.textContent = workspace.template;
  els.terminalCount.textContent = String(workspace.agents.length);
  els.attentionSpike.textContent = workspace.spike;
  els.focusedRole.textContent = active.role;
  els.focusedName.textContent = active.role.replace("-", " ");
  els.focusedStatus.textContent = active.status;
  els.focusedStatus.className = "status-pill";
  els.focusedBranch.textContent = active.branch;
  els.focusedPath.textContent = `${workspace.repo}/${active.branch}`;
  els.terminalOutput.textContent = active.output;
  els.comparePrimaryName.textContent = active.role;
  els.compareSecondaryName.textContent = compare.role;
  els.comparePrimaryOutput.textContent = active.output;
  els.compareSecondaryOutput.textContent = compare.output;

  const needsInput = workspace.agents.filter((agent) => agent.status === "needs-input").length;
  const running = workspace.agents.filter((agent) => agent.status === "running").length;
  const queued = workspace.agents.filter((agent) => agent.status === "queued").length;

  els.needsInputCount.textContent = String(needsInput);
  els.runningCount.textContent = String(running);
  els.queuedCount.textContent = String(queued);
}

function renderAgents() {
  const workspace = getWorkspace();
  els.agentList.innerHTML = "";

  workspace.agents.forEach((agent, index) => {
    const card = document.createElement("button");
    const preview = agent.output.split("\n").slice(4, 7).join("\n");
    card.className = `agent-card${agent.id === state.activeAgentId ? " active" : ""}`;
    card.innerHTML = `
      <div class="agent-card-head">
        <strong>${agent.role}</strong>
        <span class="status-inline status-${agent.status}">${agent.status}</span>
      </div>
      <div class="agent-role">${agent.branch}</div>
      <div class="agent-preview">${preview}</div>
    `;
    card.addEventListener("click", () => {
      if (agent.id !== state.activeAgentId) {
        state.compareAgentId = state.activeAgentId;
      }
      state.activeAgentId = agent.id;
      if (state.view === "overview") {
        state.view = "focus";
      }
      render();
    });
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      state.compareAgentId = agent.id;
      state.view = "compare";
      render();
    });

    if (index === 0 && !workspace.agents.some((item) => item.id === state.compareAgentId)) {
      state.compareAgentId = agent.id;
    }

    els.agentList.appendChild(card);
  });
}

function renderFeed() {
  const workspace = getWorkspace();
  els.eventFeed.innerHTML = "";

  workspace.feed.forEach((item) => {
    const card = document.createElement("article");
    card.className = "event-card";
    card.innerHTML = `
      <div class="event-meta">
        <span class="event-project">${workspace.name} / ${item.agent}</span>
        <span class="agent-role">${item.time}</span>
      </div>
      <div class="event-text">${item.text}</div>
    `;
    els.eventFeed.appendChild(card);
  });
}

function renderOverview() {
  const workspace = getWorkspace();
  els.overviewView.innerHTML = "";

  workspace.agents.forEach((agent) => {
    const card = document.createElement("button");
    card.className = "overview-card";
    card.innerHTML = `
      <div class="overview-meta">
        <strong>${agent.role}</strong>
        <span class="status-inline status-${agent.status}">${agent.status}</span>
      </div>
      <pre class="overview-snippet">${agent.output.split("\n").slice(4, 9).join("\n")}</pre>
    `;
    card.addEventListener("click", () => {
      state.activeAgentId = agent.id;
      state.view = "focus";
      render();
    });
    els.overviewView.appendChild(card);
  });
}

function renderView() {
  Object.entries(els.stageViews).forEach(([view, element]) => {
    element.classList.toggle("stage-view-active", view === state.view);
  });

  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
}

function render() {
  renderProjects();
  renderWorkspace();
  renderAgents();
  renderFeed();
  renderOverview();
  renderView();
}

els.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    renderView();
  });
});

els.cycleButton.addEventListener("click", () => {
  const workspace = getWorkspace();
  const currentIndex = workspace.agents.findIndex((agent) => agent.id === state.activeAgentId);
  const nextIndex = (currentIndex + 1) % workspace.agents.length;
  state.compareAgentId = state.activeAgentId;
  state.activeAgentId = workspace.agents[nextIndex].id;
  render();
});

setInterval(() => {
  const workspace = getWorkspace();
  const active = getAgent(state.activeAgentId);
  active.output = `${active.output}\n${timestamp()} ${active.role} heartbeat: workspace stable, awaiting next task`;
  workspace.feed.unshift(
    feedItem(active.role, `${active.role} pushed a new heartbeat to the attention rail.`, timestamp())
  );
  workspace.feed = workspace.feed.slice(0, 6);
  workspace.spike = "now";
  renderWorkspace();
  renderFeed();
  renderOverview();
}, 7000);

render();
