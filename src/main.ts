import { formattingCommand } from "./commands/formatting";
import { goToDefinition } from "./commands/goToDefinition";
import { findReferences } from "./commands/findReferences";

let langClient = null;
const mainDisposable = new CompositeDisposable();
let config = {
  formatOnSave: false,
  serverPath: "",
};

const makeServerExecutable = () => {
  const serverProcess = new Process("/usr/bin/env", {
    args: [
      "chmod",
      "u+x",
      nova.path.join(
        nova.extension.path,
        "elixir-ls-release/language_server.sh"
      ),
    ],
    cwd: nova.extension.path,
  });
  const launchProcess = new Process("/usr/bin/env", {
    args: [
      "chmod",
      "u+x",
      nova.path.join(nova.extension.path, "elixir-ls-release/launch.sh"),
    ],
    cwd: nova.extension.path,
  });
  serverProcess.start();
  launchProcess.start();
};

export const activate = function () {
  console.log("activating Elixir LS...");
  nova.config.observe("elixir-ls.format-on-save", function (isOn: boolean) {
    config.formatOnSave = isOn;
  });

  nova.config.observe("elixir-ls.language-server-path", function (
    path: string
  ) {
    config.serverPath = path;
    startServer(path);
  });
};

export const deactivate = function () {
  stopServer();
};

const startServer = (path: string) => {
  if (langClient) {
    langClient.stop();
    nova.subscriptions.remove(langClient);
  }

  makeServerExecutable();
  // Use the default server path
  if (!path) {
    path = nova.extension.path + "/elixir-ls-release/language_server.sh";
  }

  // Create the client
  const serverOptions = {
    path: path,
  };
  const clientOptions = {
    // The set of document syntaxes for which the server is valid
    syntaxes: ["elixir"],
  };
  const client: any = new LanguageClient(
    "elixir-ls-langserver",
    "Elixir Language Server",
    serverOptions,
    clientOptions
  );

  try {
    // Start the client
    client.start();

    mainDisposable.add(
      client.onDidStop((err) => {
        let message =
          "Elixir Language Server stopped unexpectedly.\n Please report this error.";

        message += `\n\n ${err}`;

        nova.workspace.showActionPanel(
          message,
          {
            buttons: ["Restart", "Ignore"],
          },
          (index) => {
            if (index == 0) {
              nova.commands.invoke("raulchedrese.elixir-ls.restart");
            }
          }
        );
      })
    );

    // Can be used to set custom `projectDir` or `mixEnv`. If we don't call this it sends
    // a warning notification.
    client.sendNotification("workspace/didChangeConfiguration", {
      settings: {
        elixirLS: {
          dialyzerEnabled: true,
          dialyzerFormat: true,
        },
      },
    });

    // Add the client to the subscriptions to be cleaned up
    nova.subscriptions.add(client);
    langClient = client;

    // Find References
    nova.commands.register(
      "raulchedrese.elixir-ls.findReferences",
      (editor) => {
        findReferences(client, editor);
      }
    );

    // Format on Save
    mainDisposable.add(
      nova.workspace.onDidAddTextEditor((editor) => {
        if (editor.document.syntax !== "elixir") return;
        const editorDisposable = new CompositeDisposable();
        mainDisposable.add(
          editor.onDidDestroy(() => editorDisposable.dispose())
        );

        editorDisposable.add(
          editor.onWillSave((editor) => {
            if (config.formatOnSave) {
              return formattingCommand(client, editor);
            }
          })
        );
      })
    );
  } catch (err) {
    // If the .start() method throws, it's likely because the path to the language server is invalid

    if (nova.inDevMode()) {
      console.error(err);
    }
  }
};

const stopServer = () => {
  if (langClient) {
    langClient.stop();
    nova.subscriptions.remove(langClient);
    mainDisposable.dispose();
    langClient = null;
  }
};

const restart = () => {
  stopServer();
  console.log("restarting Elixir LS...");
  startServer(config.serverPath);
};

nova.commands.register("raulchedrese.elixir-ls.restart", restart);
