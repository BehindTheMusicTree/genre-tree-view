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

interface LargeRootDef {
  name: string;
  subgenres: string[];
}

// Real genre/subgenre names, 15-60 per root, so the large wheel demo reads like an actual
// genre catalogue instead of "Rock sub-genre 12".
const LARGE_ROOTS: LargeRootDef[] = [
  {
    name: "Rock",
    subgenres: [
      "Punk",
      "Post-Punk",
      "Hardcore Punk",
      "Garage Rock",
      "Psychedelic Rock",
      "Progressive Rock",
      "Alternative Rock",
      "Indie Rock",
      "Grunge",
      "Glam Rock",
      "Southern Rock",
      "Blues Rock",
      "Hard Rock",
      "Soft Rock",
      "Art Rock",
      "Math Rock",
      "Post-Rock",
      "Stoner Rock",
      "Surf Rock",
      "Rockabilly",
      "Krautrock",
      "Noise Rock",
      "Shoegaze",
      "Emo",
      "Pop Punk",
      "Ska Punk",
      "Folk Rock",
      "Country Rock",
      "Yacht Rock",
      "Arena Rock",
      "Gothic Rock",
      "Industrial Rock",
    ],
  },
  {
    name: "Electronic",
    subgenres: [
      "Techno",
      "House",
      "Deep House",
      "Tech House",
      "Acid House",
      "Trance",
      "Progressive Trance",
      "Drum and Bass",
      "Dubstep",
      "Trap",
      "Future Bass",
      "Ambient",
      "Downtempo",
      "IDM",
      "Breakbeat",
      "Electro",
      "Synthwave",
      "Vaporwave",
      "Chillwave",
      "UK Garage",
      "Grime",
      "Hardstyle",
      "Gabber",
      "Jungle",
      "Minimal Techno",
      "Detroit Techno",
      "Big Room",
      "Electro Swing",
      "Nu-Disco",
      "Disco",
    ],
  },
  {
    name: "Jazz",
    subgenres: [
      "Swing",
      "Bebop",
      "Hard Bop",
      "Cool Jazz",
      "Free Jazz",
      "Modal Jazz",
      "Fusion",
      "Smooth Jazz",
      "Latin Jazz",
      "Gypsy Jazz",
      "Acid Jazz",
      "Nu Jazz",
      "Dixieland",
      "Big Band",
      "Vocal Jazz",
      "Post-Bop",
      "Avant-Garde Jazz",
      "Soul Jazz",
      "Ska Jazz",
      "Chamber Jazz",
    ],
  },
  {
    name: "Hip-Hop",
    subgenres: [
      "Boom Bap",
      "Trap",
      "Gangsta Rap",
      "Conscious Hip Hop",
      "East Coast Hip Hop",
      "West Coast Hip Hop",
      "Southern Hip Hop",
      "Drill",
      "Cloud Rap",
      "Mumble Rap",
      "Jazz Rap",
      "Alternative Hip Hop",
      "Underground Hip Hop",
      "Horrorcore",
      "Crunk",
      "G-Funk",
      "Hyphy",
      "Trap Soul",
      "Lo-Fi Hip Hop",
      "Chopped and Screwed",
    ],
  },
  {
    name: "Classical",
    subgenres: [
      "Baroque",
      "Renaissance",
      "Medieval",
      "Classical Period",
      "Romantic",
      "Modernist",
      "Minimalism",
      "Opera",
      "Chamber Music",
      "Symphonic",
      "Choral",
      "Concerto",
      "Sonata",
      "Impressionism",
      "Neoclassicism",
      "Avant-Garde Classical",
    ],
  },
  {
    name: "Folk",
    subgenres: [
      "Traditional Folk",
      "Contemporary Folk",
      "Americana",
      "Bluegrass",
      "Celtic Folk",
      "Indie Folk",
      "Anti-Folk",
      "Folk Punk",
      "Sea Shanty",
      "Nordic Folk",
      "Appalachian Folk",
      "Gospel Folk",
      "World Folk",
      "Freak Folk",
      "Chamber Folk",
      "Neofolk",
      "Progressive Folk",
      "Psych Folk",
    ],
  },
  {
    name: "Metal",
    subgenres: [
      "Heavy Metal",
      "Thrash Metal",
      "Death Metal",
      "Black Metal",
      "Doom Metal",
      "Power Metal",
      "Progressive Metal",
      "Nu Metal",
      "Metalcore",
      "Deathcore",
      "Sludge Metal",
      "Stoner Metal",
      "Symphonic Metal",
      "Folk Metal",
      "Industrial Metal",
      "Groove Metal",
      "Speed Metal",
      "Gothic Metal",
      "Viking Metal",
      "Djent",
      "Grindcore",
      "Melodic Death Metal",
      "Rap Metal",
      "Mathcore",
    ],
  },
  {
    name: "Pop",
    subgenres: [
      "Synth-pop",
      "Dance-pop",
      "Electropop",
      "Indie Pop",
      "Teen Pop",
      "Power Pop",
      "Art Pop",
      "Dream Pop",
      "K-Pop",
      "J-Pop",
      "Bubblegum Pop",
      "Baroque Pop",
      "Chamber Pop",
      "Sunshine Pop",
      "Bedroom Pop",
      "Hyperpop",
      "Britpop",
      "Latin Pop",
    ],
  },
];

/** One root plus its real subgenres, branching every few nodes (chaining off the previous
 * subgenre, resetting to the root every 4th) so the tree gets a few levels deep instead of
 * dozens of siblings in a flat row. */
function buildLargeRootGroup(root: LargeRootDef, rootIndex: number): GenreTreeNode[] {
  const rootId = `large-root-${rootIndex}`;
  const nodes: GenreTreeNode[] = [{ id: rootId, parentId: null, name: root.name, itemCount: 0 }];
  root.subgenres.forEach((name, i) => {
    const parentId = i < 2 || i % 4 === 0 ? rootId : nodes[nodes.length - 1].id;
    nodes.push({ id: `${rootId}-${i}`, parentId, name, itemCount: (i * 3) % 20 });
  });
  return nodes;
}

const largeWheelNodes: GenreTreeNode[] = LARGE_ROOTS.flatMap((root, index) => buildLargeRootGroup(root, index));

let nextId = 1;
const STACKED_TREE_HEIGHT = 500;

const TABS = [
  { id: "wheel", label: "Genre wheel" },
  { id: "stacked", label: "Stacked trees" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** CRUD callbacks bound to one node list/setter pair — shared by both tabs that mount an
 * interactive tree, so the same add/rename/delete/reparent/upload logic isn't duplicated per tab. */
function createNodeCallbacks(
  nodes: GenreTreeNode[],
  setNodes: React.Dispatch<React.SetStateAction<GenreTreeNode[]>>,
  appendLog: (message: string) => void,
  setReparentingNodeId: React.Dispatch<React.SetStateAction<string | null>>,
) {
  return {
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
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("wheel");
  const [nodes, setNodes] = useState<GenreTreeNode[]>(initialNodes);
  const [wheelNodes, setWheelNodes] = useState<GenreTreeNode[]>(largeWheelNodes);
  const [playingNodeId, setPlayingNodeId] = useState<string | null>(null);
  const [playState, setPlayState] = useState<GenreTreePlayState>("paused");
  const [reparentingNodeId, setReparentingNodeId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = (message: string) => setLog((prev) => [message, ...prev].slice(0, 8));

  const groups = groupNodesByRoot(nodes);

  const playCallbacks = {
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
  };

  const sharedCallbacks = { ...playCallbacks, ...createNodeCallbacks(nodes, setNodes, appendLog, setReparentingNodeId) };
  const wheelCallbacks = {
    ...playCallbacks,
    ...createNodeCallbacks(wheelNodes, setWheelNodes, appendLog, setReparentingNodeId),
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>genre-tree-view playground <small>v{genreTreeViewVersion}</small></h1>

      <p>
        {reparentingNodeId
          ? `Reparenting "${[...nodes, ...wheelNodes].find((n) => n.id === reparentingNodeId)?.name}" — hover a node in either tree and click "Select as new parent".`
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
            nodes={wheelNodes}
            {...wheelCallbacks}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`wheel selected root ${rootId}`)}
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
