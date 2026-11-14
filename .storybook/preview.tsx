import type { Preview } from "storybook-solidjs-vite";
import "../src/renderer/src/styles.css";
import "./preview.css";
import { MODE_PREFERENCES, setModePreference, setThemePreference, THEME_PREFERENCES } from "../src/renderer/src/theme";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    a11y: {
      test: "error",
    },
    controls: {
      expanded: true,
    },
  },
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Luna Bot theme",
      defaultValue: "eclipse",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        dynamicTitle: true,
        items: [
          { value: "auto", title: "Auto" },
          { value: "papel", title: "Papel" },
          { value: "eclipse", title: "Eclipse" },
          { value: "quadrante", title: "Quadrante" },
        ],
      },
    },
    mode: {
      name: "Mode",
      description: "Luna Bot light or dark mode",
      defaultValue: "dark",
      toolbar: {
        title: "Mode",
        icon: "contrast",
        dynamicTitle: true,
        items: [
          { value: "system", title: "System" },
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = THEME_PREFERENCES.find((option) => option === context.globals.theme);
      const mode = MODE_PREFERENCES.find((option) => option === context.globals.mode);
      if (theme) setThemePreference(theme);
      if (mode) setModePreference(mode);
      return Story();
    },
  ],
};

export default preview;
