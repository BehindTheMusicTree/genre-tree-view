import { useState } from "react";
import {
  GenreTree,
  GenreTreeWheel,
  GenreTreeWheelRadial,
  GenreTreeWheelRadialPopCore,
  GenreTreeWheelRight,
  groupNodesByRoot,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  type GenreTreeNode,
  type GenreTreePlayState,
} from "@behindthemusictree/genre-tree-view";
import { version as genreTreeViewVersion } from "@behindthemusictree/genre-tree-view/package.json";

const MIN_DEMO_ITEM_COUNT = 50;
const MAX_DEMO_ITEM_COUNT = 10000;

/** Deterministic pseudo-realistic track count for demo nodes, spread across
 * [MIN_DEMO_ITEM_COUNT, MAX_DEMO_ITEM_COUNT] via a large prime multiplier so nearby seeds
 * don't cluster together. */
function demoItemCount(seed: number): number {
  return MIN_DEMO_ITEM_COUNT + ((seed * 9973) % (MAX_DEMO_ITEM_COUNT - MIN_DEMO_ITEM_COUNT + 1));
}

const initialNodes: GenreTreeNode[] = [
  { id: "root-a", parentId: null, name: "Rock", itemCount: 0, actionable: false },
  { id: "a-punk", parentId: "root-a", name: "Punk", itemCount: 340 },
  { id: "a-post-punk", parentId: "a-punk", name: "Post-Punk", itemCount: 95 },
  { id: "a-metal", parentId: "root-a", name: "Metal", itemCount: 0 },

  { id: "root-b", parentId: null, name: "Electronic", itemCount: 0, actionable: false },
  { id: "b-techno", parentId: "root-b", name: "Techno", itemCount: 1250 },
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
      itemCount: demoItemCount(depth * 7 + i),
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
    name: "Pop Music",
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

// One target depth per root (matching LARGE_ROOTS order below) so the demo shows a mix of
// shallow and deep subtrees instead of every root maxing out at the same depth.
const LARGE_ROOT_TARGET_DEPTHS = [5, 8, 3, 10, 4, 9, 6, 7];

// Cycles through varying branch-off counts (further capped by each node's remaining capacity
// out of 5 total children) so no node always branches the same amount.
const LARGE_ROOT_BRANCH_COUNTS = [0, 2, 4, 1, 3, 0, 5, 2];

// Small crossover subgenre sets used to give most roots a "pop" branch alongside their main
// ("core") spine — Classical is deliberately omitted so the pop-core wheel demo shows a root
// with no pop subtree, per the feature's "pop is optional" requirement.
const POP_BRANCHES: Record<string, string[]> = {
  Rock: [
    "Pop Rock",
    "Soft Rock Radio",
    "Adult Contemporary Rock",
    "Arena Rock Radio",
    "Power Pop Rock",
    "Yacht Rock Revival",
  ],
  Electronic: ["Pop EDM", "Radio Trance", "Commercial Dance"],
  Jazz: ["Smooth Jazz Pop", "Jazz Standards", "Easy Listening Jazz"],
  "Hip-Hop": ["Pop Rap", "Radio Rap", "Crossover Hip Hop", "Party Rap"],
  Folk: ["Folk Pop", "Radio Folk"],
  Metal: ["Pop Metal", "Radio Rock Metal", "Alt Metal Crossover"],
  Pop: ["Mainstream Pop", "Adult Pop", "Pop Radio Hits"],
};

/** One root plus its real subgenres, built as a spine of LARGE_ROOT_TARGET_DEPTHS[rootIndex]
 * nodes (fixing the max depth, and marked `side: "core"`) with the remaining subgenres attached
 * breadth-first onto any node below that depth, capping every node at 5 children total so
 * branching stays varied without ever exceeding the depth target. Roots listed in POP_BRANCHES
 * also get a second, shallow direct child marked `side: "pop"`. */
function buildLargeRootGroup(root: LargeRootDef, rootIndex: number): GenreTreeNode[] {
  const rootId = `large-root-${rootIndex}`;
  const nodes: GenreTreeNode[] = [{ id: rootId, parentId: null, name: root.name, itemCount: 0 }];
  const remaining = [...root.subgenres];
  const targetDepth = Math.min(LARGE_ROOT_TARGET_DEPTHS[rootIndex % LARGE_ROOT_TARGET_DEPTHS.length], remaining.length);

  const depthOf = new Map<string, number>([[rootId, 0]]);
  const childCountOf = new Map<string, number>([[rootId, 0]]);
  const queue: string[] = [rootId];

  let spineTail = rootId;
  for (let d = 0; d < targetDepth; d++) {
    const name = remaining.shift()!;
    const id = `${rootId}-${nodes.length}`;
    nodes.push({
      id,
      parentId: spineTail,
      name,
      itemCount: demoItemCount(nodes.length),
      ...(d === 0 ? { side: "core" as const } : {}),
    });
    depthOf.set(id, d + 1);
    childCountOf.set(id, 0);
    childCountOf.set(spineTail, (childCountOf.get(spineTail) ?? 0) + 1);
    if (d + 1 < targetDepth) queue.push(id);
    spineTail = id;
  }

  let patternIndex = 0;
  while (remaining.length > 0) {
    const parentId = queue.shift()!;
    const parentDepth = depthOf.get(parentId)!;
    const capacity = 5 - childCountOf.get(parentId)!;
    const count = Math.min(LARGE_ROOT_BRANCH_COUNTS[patternIndex++ % LARGE_ROOT_BRANCH_COUNTS.length], capacity, remaining.length);
    for (let i = 0; i < count; i++) {
      const name = remaining.shift()!;
      const id = `${rootId}-${nodes.length}`;
      const depth = parentDepth + 1;
      nodes.push({ id, parentId, name, itemCount: demoItemCount(nodes.length) });
      depthOf.set(id, depth);
      childCountOf.set(id, 0);
      childCountOf.set(parentId, childCountOf.get(parentId)! + 1);
      if (depth < targetDepth) queue.push(id);
    }
    // A low pattern draw can leave capacity unused — requeue so this node gets another
    // chance instead of permanently starving (which would silently drop leftover names).
    if (capacity - count > 0 && parentDepth < targetDepth) queue.push(parentId);
  }

  const popNames = POP_BRANCHES[root.name];
  if (popNames) {
    const popRootId = `${rootId}-pop`;
    nodes.push({
      id: popRootId,
      parentId: rootId,
      name: `${root.name} (Pop)`,
      itemCount: demoItemCount(nodes.length),
      side: "pop",
    });
    let popParentId = popRootId;
    for (const name of popNames) {
      const id = `${rootId}-${nodes.length}`;
      nodes.push({ id, parentId: popParentId, name, itemCount: demoItemCount(nodes.length) });
      popParentId = id;
    }
  }

  return nodes;
}

const largeWheelNodes: GenreTreeNode[] = [
  ...LARGE_ROOTS.flatMap((root, index) => buildLargeRootGroup(root, index)),
  // Required by GenreTreeWheelRadialPopCore: a root named "Mainstream Pop", rendered at the
  // wheel's pivot point instead of a plain center label. Its own subtree (below) is hidden until
  // the center chip is clicked.
  { id: "pop", parentId: null, name: "Mainstream Pop", itemCount: 4200 },
  { id: "pop-radio", parentId: "pop", name: "Radio Hits", itemCount: 900 },
  { id: "pop-charts", parentId: "pop", name: "Chart Toppers", itemCount: 600 },
  { id: "pop-teen", parentId: "pop", name: "Teen Pop", itemCount: 150 },
  { id: "pop-radio-top40", parentId: "pop-radio", name: "Top 40", itemCount: 300 },
  { id: "pop-radio-throwback", parentId: "pop-radio", name: "Throwback Radio", itemCount: 200 },
  { id: "pop-charts-viral", parentId: "pop-charts", name: "Viral Hits", itemCount: 100 },
  // Deep enough (depth 5 under "pop") that its outer-circle extent exceeds every ring root's own
  // pop-wedge extent above, so expanding this subtree visibly grows the wheel in the playground —
  // with only the earlier, shallower nodes, the ring roots' own pop wedges always stayed larger and
  // the wheel never grew regardless of this subtree's expand state.
  { id: "pop-radio-top40-viral", parentId: "pop-radio-top40", name: "Viral 40", itemCount: 150 },
  { id: "pop-radio-top40-tiktok", parentId: "pop-radio-top40-viral", name: "TikTok Hits", itemCount: 100 },
  { id: "pop-radio-top40-trending", parentId: "pop-radio-top40-tiktok", name: "Trending Now", itemCount: 60 },
];

let nextId = 1;

const TABS = [
  { id: "wheel-radial-pop-core", label: "Genre wheel (radial, pop/core)" },
  { id: "wheel", label: "Genre wheel" },
  { id: "wheel-right", label: "Genre wheel (right)" },
  { id: "wheel-radial", label: "Genre wheel (radial)" },
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
    additionalActions: (node: GenreTreeNode) => [
      {
        key: "upload",
        icon: () => "↑",
        label: () => "Upload files",
        placement: "primary" as const,
        onClick: () => {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.onchange = () => {
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;
            setNodes((prev) =>
              prev.map((n) => (n.id === node.id ? { ...n, itemCount: n.itemCount + files.length } : n)),
            );
            appendLog(`uploaded ${files.length} file(s) to ${node.id}`);
          };
          input.click();
        },
      },
    ],
  };
}

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("wheel-radial-pop-core");
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
        <div
          style={{
            width: DEFAULT_FRAME_WIDTH,
            height: DEFAULT_FRAME_HEIGHT,
            border: "1px solid #e4e4e7",
            background: "#f4f4f5",
            marginBottom: 32,
          }}
        >
          <GenreTreeWheel
            nodes={wheelNodes}
            {...wheelCallbacks}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`wheel selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "wheel-right" && (
        <div
          style={{
            width: DEFAULT_FRAME_WIDTH,
            height: DEFAULT_FRAME_HEIGHT,
            border: "1px solid #e4e4e7",
            background: "#f4f4f5",
            marginBottom: 32,
          }}
        >
          <GenreTreeWheelRight
            nodes={wheelNodes}
            {...wheelCallbacks}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`wheel-right selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "wheel-radial" && (
        <div
          style={{
            width: DEFAULT_FRAME_WIDTH,
            height: DEFAULT_FRAME_HEIGHT,
            border: "1px solid #e4e4e7",
            background: "#f4f4f5",
            marginBottom: 32,
          }}
        >
          <GenreTreeWheelRadial
            nodes={wheelNodes}
            {...wheelCallbacks}
            centerLabel="TheMusicTree"
            onRootSelect={(rootId) => appendLog(`wheel-radial selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "wheel-radial-pop-core" && (
        <div
          style={{
            width: DEFAULT_FRAME_WIDTH,
            height: DEFAULT_FRAME_HEIGHT,
            border: "1px solid #e4e4e7",
            background: "#f4f4f5",
            marginBottom: 32,
          }}
        >
          <GenreTreeWheelRadialPopCore
            nodes={wheelNodes}
            {...wheelCallbacks}
            onRootSelect={(rootId) => appendLog(`wheel-radial-pop-core selected root ${rootId}`)}
          />
        </div>
      )}

      {activeTab === "stacked" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>
          {groups.map((group) => (
            <div
              key={group.root.id}
              style={{
                width: DEFAULT_FRAME_WIDTH,
                height: DEFAULT_FRAME_HEIGHT,
                border: "1px solid #e4e4e7",
                background: "#f4f4f5",
              }}
            >
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
