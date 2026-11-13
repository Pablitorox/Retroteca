// Lancador da Retroteca: Retroteca.exe ao lado da pasta "Retroteca" (ou dentro dela).
// Inicia "node serve.js --abrir" sem janela de console; o servidor abre o Edge em tela cheia
// e encerra sozinho quando o Edge fecha. "Retroteca.exe --servidor" sobe so o servidor (testes).
// Compilado por publicar-hd.ps1 com o csc do .NET Framework 4 (vem com o Windows).
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Programa
{
    [STAThread]
    static int Main(string[] args)
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string app = Path.Combine(baseDir, "Retroteca");
        if (!File.Exists(Path.Combine(app, "serve.js"))) app = baseDir;
        if (!File.Exists(Path.Combine(app, "serve.js")))
        {
            Aviso("Não encontrei a pasta \"Retroteca\" ao lado deste programa.");
            return 1;
        }
        string node = AcharNode(app);
        if (node == null)
        {
            Aviso("O Node.js não está instalado neste PC.\n\nInstale a versão LTS em https://nodejs.org e abra a Retroteca de novo.");
            return 2;
        }
        bool soServidor = Array.IndexOf(args, "--servidor") >= 0;
        var psi = new ProcessStartInfo(node, "serve.js" + (soServidor ? "" : " --abrir"));
        psi.WorkingDirectory = app;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        try { Process.Start(psi); }
        catch (Exception e) { Aviso("Não consegui iniciar a Retroteca:\n" + e.Message); return 3; }
        return 0;
    }

    // node portatil ao lado do app (opcional) > instalacao padrao > PATH
    static string AcharNode(string app)
    {
        string[] fixos = {
            Path.Combine(Path.Combine(app, "node"), "node.exe"),
            Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs"), "node.exe"),
            Path.Combine(Path.Combine(Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA") ?? "", "Programs"), "nodejs"), "node.exe")
        };
        foreach (string p in fixos) if (File.Exists(p)) return p;
        foreach (string d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';'))
        {
            try
            {
                string p = Path.Combine(d.Trim().Trim('"'), "node.exe");
                if (d.Trim().Length > 0 && File.Exists(p)) return p;
            }
            catch (ArgumentException) { }
        }
        return null;
    }

    static void Aviso(string texto)
    {
        MessageBox.Show(texto, "Retroteca", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }
}
