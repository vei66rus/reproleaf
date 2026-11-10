#requires -Version 7.0
param([Parameter(Mandatory=$true)][string]$Destination,[switch]$DryRun)
$ErrorActionPreference='Stop'
$kitRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$allowed=@('README.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','LICENSE','CITATION.cff','.gitignore','.env.example','package.json','package-lock.json','docs/SITE-CONTEXT.md','docs/PROJECT-CONTEXT.md','docs/PARAGRAPH-REVIEW.md','.github/workflows/ci.yml','tools/package-local-preview.ps1','src','cases','fixtures','skills','packs','examples','tests','integrations')
$exportItems=$allowed | ForEach-Object { Join-Path $kitRoot $_ }
$target=[System.IO.Path]::GetFullPath($Destination)
if([System.IO.Path]::GetExtension($target) -ne '.zip'){throw 'ZIP destination required'}
if(Test-Path -LiteralPath $target){throw 'Export destination already exists; choose a new file. Existing archives are never overwritten.'}
$files=@()
foreach($item in $exportItems){
  $source=Get-Item -LiteralPath $item -Force
  if($source.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Symlinks are excluded from the source export'}
  if($source.PSIsContainer){
    $sourceRoot=[IO.Path]::GetFullPath($source.FullName).TrimEnd([IO.Path]::DirectorySeparatorChar)+[IO.Path]::DirectorySeparatorChar
    if($target.StartsWith($sourceRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Export destination must be outside included source directories'}
    $children=@(Get-ChildItem -LiteralPath $item -Recurse -Force)
    if($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }){throw 'Symlinks are excluded from the source export'}
    $files+=@($children | Where-Object { -not $_.PSIsContainer })
  }else{$files+=$source}
}
$inventory=@($files | ForEach-Object {
  $relative=[IO.Path]::GetRelativePath($kitRoot,$_.FullName).Replace('\','/')
  if($relative.StartsWith('../') -or $relative.StartsWith('/')){throw 'Source path escaped the export root'}
  if($relative -ne '.env.example' -and $relative -match '(^|/)(private|artifacts|node_modules|credentials|\.git)(/|$)|(^|/)\.env(?:\.|/|$)|(^|/)\.npmrc$'){throw 'Private path in source export; no archive was created'}
  [pscustomobject]@{Source=$_.FullName;Entry=$relative;Bytes=$_.Length}
})
if($DryRun){
  [pscustomobject]@{Path=$target;DryRun=$true;Files=$inventory.Count;SourceBytes=($inventory | Measure-Object -Property Bytes -Sum).Sum;Entries=@($inventory.Entry)} | ConvertTo-Json -Depth 3
  return
}
New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$writer=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach($file in $inventory){
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($writer,$file.Source,$file.Entry,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $writer.Dispose();$stream.Dispose() }
$zip=[IO.Compression.ZipFile]::OpenRead($target)
try {
  $entries=@($zip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
  if($entries | Where-Object { $_ -ne '.env.example' -and $_ -match '(^|/)(private|artifacts|node_modules|credentials|\.git)(/|$)|(^|/)\.env(?:\.|/|$)|(^|/)\.npmrc$' }) { throw 'Private path in archive' }
  [pscustomobject]@{Path=$target;Files=$entries.Count;Bytes=(Get-Item -LiteralPath $target).Length;Sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash} | ConvertTo-Json
} finally { $zip.Dispose() }
