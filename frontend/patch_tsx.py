import sys

with open('src/pydree/PydreeStudio.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = 'function TreeRows(props: { nodes: TreeNode[]; depth: number; selected: string; onSelect: (id: string) => void }): JSX.Element {\n'
end_marker = '/* ------------------------------------------------------------------ shell */\n'

start_idx = content.find(start_marker)
if start_idx == -1:
    print('Start not found')
    sys.exit(1)

end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print('End not found')
    sys.exit(1)

new_block = """function TreeRows(props: { nodes: TreeNode[]; depth: number; selected: string; onSelect: (id: string) => void }): JSX.Element {
  return (
    <>
      {props.nodes.map((n) => (
        <TreeItem key={n.id} node={n} depth={props.depth} selected={props.selected} onSelect={props.onSelect} />
      ))}
    </>
  );
}
function TreeItem(props: { node: TreeNode; depth: number; selected: string; onSelect: (id: string) => void }): JSX.Element {
  const { node } = props;
  const [open, setOpen] = useState(true);
  const hasChildren = Array.isArray(node.children);
  const Glyph = TREE_ICONS[node.icon];
  return (
    <>
      <div
        className={`${styles.treeRow} ${props.selected === node.id ? styles.treeSelected : ""}`}
        onClick={() => props.onSelect(node.id)}
      >
        <span className={styles.treeTwisty} onClick={(e) => { e.stopPropagation(); if (hasChildren) setOpen((o) => !o); }}>
          {hasChildren ? (open ? <ChevronDown size={14} className="lucide" /> : <ChevronRight size={14} className="lucide" />) : null}
        </span>
        <span className={styles.treeIconBox}>
          <Glyph size={14} className="lucide" />
        </span>
        <span className={styles.treeName}>{node.name}</span>
      </div>
      {hasChildren && open && node.children!.length > 0 ? (
        <div className={styles.treeChildren}>
          <TreeRows nodes={node.children!} depth={0} selected={props.selected} onSelect={props.onSelect} />
        </div>
      ) : null}
    </>
  );
}

"""

new_content = content[:start_idx] + new_block + content[end_idx:]

with open('src/pydree/PydreeStudio.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Restored successfully')
