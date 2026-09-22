import { useShell } from "../shared/ui/shell";

/**
 * Placeholder index route inside the shell. The journal page replaces it
 * once the journal transactions exist.
 */
export default function Home() {
  const shell = useShell();
  return (
    <section className="page active" id="mine">
      <h1>Your Top 100 journey.</h1>
      <p>
        {shell.selectedState
          ? "Selected state: " + shell.selectedState
          : "No state selected."}
      </p>
    </section>
  );
}
