{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.postgresql_16
    pkgs.openssl
  ];
}
