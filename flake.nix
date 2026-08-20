{
  description = "Anori dev shell (Node 26 + pnpm 10)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodeVersion = pkgs.nodejs_26;
        pnpmVersion = pkgs.pnpm.override { nodejs = nodeVersion; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            nodeVersion
            pnpmVersion
          ];

          shellHook = ''
            echo "→ Anori dev shell: $(node --version) / $(pnpm --version)"
          '';
        };
      });
}
