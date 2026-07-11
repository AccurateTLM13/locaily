const { resolveInputMap } = require("../crew/input-map-resolver");

function computeDependencyGraph(track) {
  const stepIds = track.steps.map(s => s.id);
  const stepMap = {};
  track.steps.forEach(s => { stepMap[s.id] = s; });

  const edges = [];
  const declaredDeps = {};

  for (const step of track.steps) {
    const deps = collectDependencies(step, stepIds);
    const unique = [...new Set(deps)];
    edges.push(...unique.map(d => ({ from: d, to: step.id })));
    declaredDeps[step.id] = unique;
  }

  const sorted = topologicalSort(stepIds, edges);
  const cycles = findCycles(stepIds, edges);
  const missing = findMissingStepRefs(track, stepIds);

  return {
    stepIds,
    edges,
    declaredDeps,
    sorted,
    cycles,
    missing,
    valid: cycles.length === 0 && missing.length === 0,
    entryPoints: stepIds.filter(id => !edges.some(e => e.to === id)),
    leafNodes: stepIds.filter(id => !edges.some(e => e.from === id))
  };
}

function collectDependencies(step, validStepIds) {
  const deps = [];

  if (step.depends_on && Array.isArray(step.depends_on)) {
    deps.push(...step.depends_on);
  }

  if (step.input_map) {
    const refs = extractArtifactReferences(step.input_map);
    for (const ref of refs) {
      if (validStepIds.includes(ref)) {
        if (!deps.includes(ref)) deps.push(ref);
      }
    }
  }

  return deps;
}

function extractArtifactReferences(inputMap) {
  const refs = [];
  const seen = new Set();

  function walk(value) {
    if (typeof value === "string") {
      const match = value.match(/^\$artifacts\.([^.]+)/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        refs.push(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  }

  walk(inputMap);
  return refs;
}

function topologicalSort(nodeIds, edges) {
  const inDegree = {};
  const adjacency = {};

  for (const id of nodeIds) {
    inDegree[id] = 0;
    adjacency[id] = [];
  }

  for (const edge of edges) {
    if (adjacency[edge.from]) {
      adjacency[edge.from].push(edge.to);
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    }
  }

  const queue = nodeIds.filter(id => (inDegree[id] || 0) === 0);
  const sorted = [];

  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);

    for (const neighbor of (adjacency[node] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}

function findCycles(nodeIds, edges) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const parent = {};
  const cycles = [];

  for (const id of nodeIds) color[id] = WHITE;

  const adjacency = {};
  for (const id of nodeIds) adjacency[id] = [];
  for (const edge of edges) {
    if (adjacency[edge.from]) adjacency[edge.from].push(edge.to);
  }

  function dfs(node) {
    color[node] = GRAY;
    for (const neighbor of (adjacency[node] || [])) {
      if (color[neighbor] === GRAY) {
        const cycle = [neighbor, node];
        let cur = node;
        while (cur !== neighbor && parent[cur] !== undefined) {
          cur = parent[cur];
          if (cur !== neighbor) cycle.push(cur);
        }
        cycle.reverse();
        cycles.push(cycle);
      } else if (color[neighbor] === WHITE) {
        parent[neighbor] = node;
        dfs(neighbor);
      }
    }
    color[node] = BLACK;
  }

  for (const id of nodeIds) {
    if (color[id] === WHITE) dfs(id);
  }

  return cycles;
}

function findMissingStepRefs(track, validStepIds) {
  const missing = [];

  for (const step of track.steps) {
    if (step.depends_on && Array.isArray(step.depends_on)) {
      for (const dep of step.depends_on) {
        if (!validStepIds.includes(dep)) {
          missing.push({ step: step.id, dependsOn: dep, reason: "depends_on references undefined step" });
        }
      }
    }

    const refs = extractArtifactReferences(step.input_map || {});
    for (const ref of refs) {
      if (!validStepIds.includes(ref) && ref !== "input") {
        missing.push({ step: step.id, dependsOn: ref, reason: "input_map $artifacts references undefined step" });
      }
    }
  }

  return missing;
}

function computeLevels(nodeIds, edges) {
  const inDegree = {};
  const adjacency = {};
  const levels = {};

  for (const id of nodeIds) { inDegree[id] = 0; adjacency[id] = []; levels[id] = 0; }
  for (const e of edges) {
    if (adjacency[e.from]) adjacency[e.from].push(e.to);
    inDegree[e.to] = (inDegree[e.to] || 0) + 1;
  }

  const queue = nodeIds.filter(id => (inDegree[id] || 0) === 0).map(id => ({ id, level: 0 }));
  let head = 0;

  while (head < queue.length) {
    const { id, level } = queue[head++];
    levels[id] = level;
    for (const neighbor of (adjacency[id] || [])) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push({ id: neighbor, level: level + 1 });
      }
    }
  }

  return levels;
}

function groupByLevel(nodeIds, edges) {
  const levels = computeLevels(nodeIds, edges);
  const groups = {};
  for (const id of nodeIds) {
    const l = levels[id] || 0;
    if (!groups[l]) groups[l] = [];
    groups[l].push(id);
  }
  return groups;
}

module.exports = {
  computeDependencyGraph,
  topologicalSort,
  findCycles,
  findMissingStepRefs,
  collectDependencies,
  extractArtifactReferences,
  computeLevels,
  groupByLevel
};
