class Zodded < Formula
  desc "A modern CLI tool for static analysis and validation of Zod schemas"
  homepage "https://github.com/JSONbored/zodkit"
  url "https://registry.npmjs.org/zodkit/-/zodkit-0.1.0.tgz"
  sha256 "PLACEHOLDER_SHA256"
  license "MIT"

  depends_on "node@18" => :recommended

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]

    # Generate completions
    generate_completions_from_executable(bin/"zodkit", shells: [:bash, :zsh])
  end

  test do
    # Test basic help command
    assert_match "zodkit", shell_output("#{bin}/zodkit --help")

    # Test version command
    assert_match version.to_s, shell_output("#{bin}/zodkit --version")

    # Test init command in a temporary directory
    testpath.cd do
      system bin/"zodkit", "init"
      assert_predicate testpath/"zod.config.js", :exist?
    end
  end
end