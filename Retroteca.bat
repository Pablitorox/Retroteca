@echo off
rem Retroteca: abre a interface em tela cheia (Edge modo quiosque).
rem Sair: aba "Sair" no menu, ou Alt+F4.
cd /d "%~dp0"
start "" /min node serve.js --abrir
