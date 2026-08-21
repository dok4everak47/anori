export type CommandSource = "builtin" | "extension" | "user";

export type CommandCategory = "navigation" | "system" | "bookmark" | "extension";

export type CommandContext = {
  selection?: {
    type: "bookmark" | "group";
    instanceId?: string;
    pluginId?: string;
    widgetId?: string;
  } | null;
};

export type CommandResult = {
  success: boolean;
  error?: string;
  errorCode?: string;
  recoverable?: boolean;
};

export type Command = {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  keywords?: string[];
  category: CommandCategory;
  source: CommandSource;
  when?: (context: CommandContext) => boolean;
  execute: (context: CommandContext) => CommandResult | Promise<CommandResult>;
};

export type CommandRegistry = {
  commands: Command[];
  register: (command: Command) => () => void;
  unregister: (id: string) => void;
  get: (id: string) => Command | undefined;
  list: () => Command[];
  execute: (id: string, context: CommandContext) => Promise<CommandResult>;
  search: (query: string, context?: CommandContext) => Command[];
  getByCategory: (category: CommandCategory) => Command[];
};
