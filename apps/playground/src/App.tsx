import { useState } from "react";
import {
  GenreTree,
  GenreTreeWheel,
  groupNodesByRoot,
  WHEEL_DEFAULT_FRAME_HEIGHT,
  type GenreTreeNode,
  type GenreTreePlayState,
} from "@behindthemusictree/genre-tree-view";
import { version as genreTreeViewVersion } from "@behindthemusictree/genre-tree-view/package.json";

const initialNodes: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 0, actionable: false },
  { id: "a-punk", parentId: "root-a", name: "Punk", itemCount: 5 },
  { id: "a-post-punk", parentId: "a-punk", name: "Post-Punk", itemCount: 2 },
  { id: "a-metal", parentId: "root-a", name: "Metal", itemCount: 0 },

  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0, actionable: false },
  { id: "b-techno", parentId: "root-b", name: "Techno", itemCount: 8 },
  { id: "b-house", parentId: "root-b", name: "House", itemCount: 0 },
];

// Cycles through varying branching factors (including 0, a dead end) so descendants of
// a-post-punk (depth 2) cover depths 3-6 without every branch growing at the same rate.
const DEEP_BRANCH_CHILD_COUNTS = [2, 0, 3, 1, 4];

function buildDeepBranch(
  parentId: string,
  namePrefix: string,
  depth: number,
  maxDepth: number,
  countIndex: { next: number },
): GenreTreeNode[] {
  if (depth > maxDepth) return [];
  const childCount = DEEP_BRANCH_CHILD_COUNTS[countIndex.next % DEEP_BRANCH_CHILD_COUNTS.length];
  countIndex.next++;

  const nodes: GenreTreeNode[] = [];
  for (let i = 0; i < childCount; i++) {
    const id = `${namePrefix}-${i}`;
    nodes.push({
      id,
      parentId,
      name: `${namePrefix} ${i}`,
      itemCount: (depth * 3 + i) % 20,
    });
    nodes.push(...buildDeepBranch(id, id, depth + 1, maxDepth, countIndex));
  }
  return nodes;
}

initialNodes.push(...buildDeepBranch("a-post-punk", "pp-depth3", 3, 6, { next: 0 }));

const LARGE_ROOT_NAMES = ["Rock", "Electronic", "Jazz", "Hip-Hop", "Classical", "Folk", "Metal", "Pop"];

/** One root plus `nodeCount - 1` descendants, branching every few nodes so the tree gets a
 * few levels deep instead of 49 siblings in a flat row. */
function buildLargeRootGroup(rootName: string, rootIndex: number, nodeCount: number): GenreTreeNode[] {
  const rootId = `large-root-${rootIndex}`;
  const nodes: GenreTreeNode[] = [{ id: rootId, parentId: null, name: rootName, itemCount: 0 }];
  for (let i = 1; i < nodeCount; i++) {
    const parentId = i % 4 === 0 ? rootId : nodes[Math.max(0, i - 2)].id;
    nodes.push({
      id: `${rootId}-${i}`,
      parentId,
      name: `${rootName} sub-genre ${i}`,
      itemCount: (i * 3) % 20,
    });
  }
  return nodes;
}

const largeWheelNodes: GenreTreeNode[] = LARGE_ROOT_NAMES.flatMap((name, index) =>
  buildLargeRootGroup(name, index, 50),
);

let nextId = 1;
const STACKED_TREE_HEIGHT = 500;

const TABS = [
  { id: "wheel", label: "Genre wheel" },
  { id: "wheel-large", label: "Genre wheel (8 roots x 50 nodes)" },
  { id: "stacked", label: "Stacked trees" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("wheel");
  const [nodes, setNodes] = useState<GenreTreeNode[]>(initialNodes);
  const [playingNodeId, setPlayingNodeId] = useState<string | null>(null);
  const [playState, setPlayState] = useState<GenreTreePlayState>("paused");
  const [reparentingNodeId, setReparentingNodeId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (message: string) => setLog((prev) => [message, ...prev].slice(0, 8));

  const groups = groupNodesByRoot(nodes);

  const sharedCallbacks = {
    playingNodeId,
    playState,
    reparentingNodeId,
    onPlayPause: (nodeId: string) => {
      if (playingNodeId === nodeId) {
        setPlayState((s) => (s === "playing" ? "paused" : "playing"));
      } else {
        setPlayingNodeId(nodeId);
        setPlayState("playing");
      }
      appendLog(`play/pause ${nodeId}`);
    },
    onAddChild: (parentId: string) => {
      const id = `new-${nextId++}`;
      setNodes((prev) => [...prev, { id, parentId, name: "New sub-genre", itemCount: 0 }]);
      appendLog(`added child ${id} under ${parentId}`);
    },
    onRenameRequest: (node: GenreTreeNode) => {
      const name = window.prompt("Rename to:", node.name);
      if (name) {
        setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, name } : n)));
        appendLog(`renamed ${node.id} -> ${name}`);
      }
    },
    onDeleteRequest: (node: GenreTreeNode) => {
      if (window.confirm(`Delete "${node.name}" and its sub-genres?`)) {
        const idsToRemove = new Set<string>([node.id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const n of nodes) {
            if (n.parentId && idsToRemove.has(n.parentId) && !idsToRemove.has(n.id)) {
              idsToRemove.add(n.id);
              grew = true;
            }
          }
        }
        setNodes((prev) => prev.filter((n) => !idsToRemove.has(n.id)));
        appendLog(`deleted ${node.id} (+${idsToRemove.size - 1} descendants)`);
      }
    },
    onReparentRequest: (node: GenreTreeNode) => {
      setReparentingNodeId(node.id);
      appendLog(`reparent requested for ${node.id}`);
    },
    onReparent: (nodeId: string, newParentId: string) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, parentId: newParentId } : n)));
      setReparentingNodeId(null);
      appendLog(`reparented ${nodeId} -> ${newParentId}`);
    },
    onUploadFiles: (nodeId: string, files: File[]) => {
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, itemCount: n.itemCount + files.length } : n)));
      appendLog(`uploaded ${files.length} file(s) to ${nodeId}`);
    },
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>genre-tree-view playground <small>v{genreTreeViewVersion}</small></h1>

      <p>
        {reparentingNodeId
          ? `Reparenting "${nodes.find((n) => n.id === reparentingNodeId)?.name}" — hover a node in either tree and click "Select as new parent".`
          : "Hover a node to reveal an inline light icon row; the kebab holds the rest."}
      </p>
      {reparentingNodeId && (
        <button onClick={() => setReparentingNodeId(null)}>Cancel reparent</button>
      )}

      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #e4e4e7", marginBottom: 24 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 12px",
              border: "none",
              borderBottom: activeTab === tab.id ? "2px solid #4F46E5" : "2px solid transparent",
              background: "none",
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "wheel" && (
        <div style={{ height: WHEEL_DEFAULT_FRAME_HEIGHT, border: "1px solid #e4e4e7", marginBottom: 32 }}>
          <GenreTreeWheel
            nodes={nodes}
            {...sharedCallbacks}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`wheel selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "wheel-large" && (
        <div style={{ height: WHEEL_DEFAULT_FRAME_HEIGHT, border: "1px solid #e4e4e7", marginBottom: 32 }}>
          <GenreTreeWheel
            nodes={largeWheelNodes}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`large wheel selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "stacked" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>
          {groups.map((group) => (
            <div key={group.root.id} style={{ height: STACKED_TREE_HEIGHT, border: "1px solid #e4e4e7" }}>
              <GenreTree nodes={group.nodes} {...sharedCallbacks} />
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Action log</h2>
      <ul>
        {log.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
