import depthLimit from 'graphql-depth-limit';
import { visit } from 'graphql';

export default function guardedDepthLimit(maxDepth, options, callback) {
  const rule = depthLimit(maxDepth, options, callback);
  return function depthLimitWithCycleGuard(context) {
    const document = context.getDocument?.();
    if (document && hasFragmentCycle(document)) {
      // NoFragmentCyclesRule will report the error; skip depth limit to avoid recursion.
      return {};
    }
    return rule(context);
  };
}

function graphHasCycle(graph) {
  const visited = new Set();
  const stack = new Set();

  const dfs = (node) => {
    if (stack.has(node)) {
      return true; // Cycle detected
    }
    if (visited.has(node)) {
      return false; // Already checked this path
    }
    visited.add(node);
    stack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (graph.has(neighbor) && dfs(neighbor)) {
        return true;
      }
    }

    stack.delete(node);
    return false;
  };

  for (const node of graph.keys()) {
    if (dfs(node)) {
      return true;
    }
  }

  return false;
}

function hasFragmentCycle(document) {
  const fragmentGraph = new Map();
  visit(document, {
    FragmentDefinition(node) {
      fragmentGraph.set(
        node.name.value,
        collectReferencedFragments(node.selectionSet),
      );
    },
  });

  return graphHasCycle(fragmentGraph);
}

function collectReferencedFragments(selectionSet) {
  const referencedFragments = new Set();
  if (!selectionSet) {
    return [];
  }
  visit(selectionSet, {
    FragmentSpread(node) {
      referencedFragments.add(node.name.value);
    },
  });
  return Array.from(referencedFragments);
}
