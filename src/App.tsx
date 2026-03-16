import "./App.css";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

function App() {
  useKeyboardShortcuts();

  return (
    <nav className="navbar">
      <span className="navbar-title">Humanboard</span>
    </nav>
  );
}

export default App;
