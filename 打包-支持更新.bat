@echo off
chcp 65001 >nul
node "%~dp0build.js" with-update
