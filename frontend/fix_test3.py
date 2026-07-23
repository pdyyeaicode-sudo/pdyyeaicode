import re

with open('src/editor/PropertiesPanel.test.tsx', 'r') as f:
    code = f.read()

# Remove all fireEvent.click lines we injected
code = re.sub(r'^\s*fireEvent\.click\(screen\.getByRole\(\"button\", \{ name: /Fill & Stroke/i \}\)\);\n', '', code, flags=re.MULTILINE)
code = re.sub(r'^\s*fireEvent\.click\(screen\.getByRole\(\"button\", \{ name: /Blend & Opacity/i \}\)\);\n', '', code, flags=re.MULTILINE)
code = re.sub(r'^\s*try \{ fireEvent\.click\(screen\.getByRole\(\"button\", \{ name: /Fill & Stroke/i \}\)\); \} catch \(e\) \{\}\n', '', code, flags=re.MULTILINE)
code = re.sub(r'^\s*try \{ fireEvent\.click\(screen\.getByRole\(\"button\", \{ name: /Blend & Opacity/i \}\)\); \} catch \(e\) \{\}\n', '', code, flags=re.MULTILINE)

# Now, instead of expanding them manually in tests, let's just make CollapsibleSection open by default in the test file by mocking it!
# Wait, actually, let's just mock CollapsibleSection in the test file!
mock_code = '''
vi.mock(\"./PropertiesPanel\", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    CollapsibleSection: ({ title, children }: any) => (
      <section className=\"collapsible\">
        <button type=\"button\"><span>{title}</span></button>
        <div>{children}</div>
      </section>
    ),
  };
});
'''

# We can't mock a function component inside the same file unless it's exported. CollapsibleSection is NOT exported!
# BUT we can mock CollapsibleSection if we extract it, or we can just change CollapsibleSection in PropertiesPanel.tsx to defaultOpen=true!
# Wait! Changing defaultOpen=true in production code just to pass tests is bad.
# But wait, we can just export CollapsibleSection and mock it? No, it's not exported.

with open('src/editor/PropertiesPanel.test.tsx', 'w') as f:
    f.write(code)
