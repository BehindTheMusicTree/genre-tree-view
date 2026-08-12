import { useState } from "react";
import {
  GenreTree,
  GenreTreeWheel,
  groupNodesByRoot,
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

let nextId = 1;

export function App() {
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

      <h2>Genre wheel</h2>
      <div style={{ position: "relative", height: 480, border: "1px solid #e4e4e7", marginBottom: 32 }}>
        <GenreTreeWheel
          nodes={nodes}
          {...sharedCallbacks}
          onRootSelect={(rootId) => appendLog(`wheel selected root ${rootId}`)}
        />
      </div>

      <h2>Stacked trees</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>
        {groups.map((group) => (
          <GenreTree key={group.root.id} nodes={group.nodes} {...sharedCallbacks} />
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Action log</h2>
      <ul>
        {log.map((entry, i) => (
          <li key={i}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}
