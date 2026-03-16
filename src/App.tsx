import "./App.css";
import { useEffect } from "react";
import { useVaultStore } from "./stores/vaultStore";
import { LandingScreen } from "./components/LandingScreen";
import { ToastContainer } from "./components/Toast";

function App() {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const loadRecentVaults = useVaultStore((s) => s.loadRecentVaults);

  useEffect(() => {
    loadRecentVaults();
  }, [loadRecentVaults]);

  if (!vaultPath) {
    return (
      <>
        <LandingScreen />
        <ToastContainer />
      </>
    );
  }

  return (
    <>
      <nav className="navbar">
        <span className="navbar-title">Humanboard</span>
      </nav>
      <ToastContainer />
    </>
  );
}

export default App;
