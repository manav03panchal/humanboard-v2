// Zed editor file icons — SVGs from github.com/zed-industries/zed
import type { FC } from 'react'
import { createElement } from 'react'

// Import SVG URLs
import tsIcon from '../icons/typescript.svg'
import jsIcon from '../icons/javascript.svg'
import reactIcon from '../icons/react.svg'
import goIcon from '../icons/go.svg'
import rustIcon from '../icons/rust.svg'
import pythonIcon from '../icons/python.svg'
import cIcon from '../icons/c.svg'
import cppIcon from '../icons/cpp.svg'
import cssIcon from '../icons/css.svg'
import htmlIcon from '../icons/html.svg'
import javaIcon from '../icons/java.svg'
import phpIcon from '../icons/php.svg'
import rubyIcon from '../icons/ruby.svg'
import swiftIcon from '../icons/swift.svg'
import kotlinIcon from '../icons/kotlin.svg'
import dartIcon from '../icons/dart.svg'
import elixirIcon from '../icons/elixir.svg'
import luaIcon from '../icons/lua.svg'
import zigIcon from '../icons/zig.svg'
import juliaIcon from '../icons/julia.svg'
import haskellIcon from '../icons/haskell.svg'
import scalaIcon from '../icons/scala.svg'
import vueIcon from '../icons/vue.svg'
import astroIcon from '../icons/astro.svg'
import sassIcon from '../icons/sass.svg'
import yamlIcon from '../icons/yaml.svg'
import tomlIcon from '../icons/toml.svg'
import dockerIcon from '../icons/docker.svg'
import gitIcon from '../icons/git.svg'
import eslintIcon from '../icons/eslint.svg'
import prettierIcon from '../icons/prettier.svg'
import nixIcon from '../icons/nix.svg'
import terraformIcon from '../icons/terraform.svg'
import graphqlIcon from '../icons/graphql.svg'
import prismaIcon from '../icons/prisma.svg'
import codeIcon from '../icons/code.svg'
import databaseIcon from '../icons/database.svg'
import terminalIcon from '../icons/terminal.svg'
import imageIcon from '../icons/image.svg'
import audioIcon from '../icons/audio.svg'
import videoIcon from '../icons/video.svg'
import bookIcon from '../icons/book.svg'
import lockIcon from '../icons/lock.svg'
import packageIcon from '../icons/package.svg'
import settingsIcon from '../icons/settings.svg'
import fileIcon from '../icons/file.svg'
import folderIcon from '../icons/folder.svg'
import folderOpenIcon from '../icons/folder_open.svg'
import notebookIcon from '../icons/notebook.svg'
import diffIcon from '../icons/diff.svg'
import fontIcon from '../icons/font.svg'
import infoIcon from '../icons/info.svg'

// Create a React component from an SVG URL
function svgIcon(src: string): FC<{ size?: number; color?: string; strokeWidth?: number }> {
  const component: FC<{ size?: number; color?: string }> = ({ size = 16 }) =>
    createElement('img', {
      src,
      width: size,
      height: size,
      style: {
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        filter: 'invert(0.75)',
      },
      draggable: false,
    })
  component.displayName = 'ZedIcon'
  return component
}

// Extension → icon mapping
const EXT_ICONS: Record<string, FC<{ size?: number; color?: string; strokeWidth?: number }>> = {
  ts: svgIcon(tsIcon),
  tsx: svgIcon(reactIcon),
  js: svgIcon(jsIcon),
  jsx: svgIcon(reactIcon),
  mjs: svgIcon(jsIcon),
  cjs: svgIcon(jsIcon),
  go: svgIcon(goIcon),
  rs: svgIcon(rustIcon),
  py: svgIcon(pythonIcon),
  c: svgIcon(cIcon),
  h: svgIcon(cIcon),
  cpp: svgIcon(cppIcon),
  cc: svgIcon(cppIcon),
  cxx: svgIcon(cppIcon),
  hpp: svgIcon(cppIcon),
  css: svgIcon(cssIcon),
  scss: svgIcon(sassIcon),
  sass: svgIcon(sassIcon),
  less: svgIcon(cssIcon),
  html: svgIcon(htmlIcon),
  htm: svgIcon(htmlIcon),
  java: svgIcon(javaIcon),
  php: svgIcon(phpIcon),
  rb: svgIcon(rubyIcon),
  swift: svgIcon(swiftIcon),
  kt: svgIcon(kotlinIcon),
  kts: svgIcon(kotlinIcon),
  dart: svgIcon(dartIcon),
  ex: svgIcon(elixirIcon),
  exs: svgIcon(elixirIcon),
  lua: svgIcon(luaIcon),
  zig: svgIcon(zigIcon),
  jl: svgIcon(juliaIcon),
  hs: svgIcon(haskellIcon),
  scala: svgIcon(scalaIcon),
  vue: svgIcon(vueIcon),
  astro: svgIcon(astroIcon),
  graphql: svgIcon(graphqlIcon),
  gql: svgIcon(graphqlIcon),
  prisma: svgIcon(prismaIcon),
  sql: svgIcon(databaseIcon),
  json: svgIcon(codeIcon),
  yaml: svgIcon(yamlIcon),
  yml: svgIcon(yamlIcon),
  toml: svgIcon(tomlIcon),
  xml: svgIcon(codeIcon),
  svg: svgIcon(imageIcon),
  md: svgIcon(bookIcon),
  mdx: svgIcon(bookIcon),
  txt: svgIcon(fileIcon),
  pdf: svgIcon(bookIcon),
  sh: svgIcon(terminalIcon),
  bash: svgIcon(terminalIcon),
  zsh: svgIcon(terminalIcon),
  fish: svgIcon(terminalIcon),
  nix: svgIcon(nixIcon),
  tf: svgIcon(terraformIcon),
  hcl: svgIcon(terraformIcon),
  png: svgIcon(imageIcon),
  jpg: svgIcon(imageIcon),
  jpeg: svgIcon(imageIcon),
  gif: svgIcon(imageIcon),
  webp: svgIcon(imageIcon),
  ico: svgIcon(imageIcon),
  mp3: svgIcon(audioIcon),
  wav: svgIcon(audioIcon),
  ogg: svgIcon(audioIcon),
  flac: svgIcon(audioIcon),
  aac: svgIcon(audioIcon),
  m4a: svgIcon(audioIcon),
  mp4: svgIcon(videoIcon),
  webm: svgIcon(videoIcon),
  mov: svgIcon(videoIcon),
  woff: svgIcon(fontIcon),
  woff2: svgIcon(fontIcon),
  ttf: svgIcon(fontIcon),
  otf: svgIcon(fontIcon),
  ipynb: svgIcon(notebookIcon),
  diff: svgIcon(diffIcon),
  patch: svgIcon(diffIcon),
  lock: svgIcon(lockIcon),
  env: svgIcon(settingsIcon),
}

// Filename → icon mapping
const NAME_ICONS: Record<string, FC<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Dockerfile: svgIcon(dockerIcon),
  'docker-compose.yml': svgIcon(dockerIcon),
  'docker-compose.yaml': svgIcon(dockerIcon),
  '.gitignore': svgIcon(gitIcon),
  '.gitmodules': svgIcon(gitIcon),
  '.gitattributes': svgIcon(gitIcon),
  'Cargo.toml': svgIcon(rustIcon),
  'Cargo.lock': svgIcon(lockIcon),
  'go.mod': svgIcon(goIcon),
  'go.sum': svgIcon(lockIcon),
  'tsconfig.json': svgIcon(tsIcon),
  'package.json': svgIcon(packageIcon),
  'package-lock.json': svgIcon(lockIcon),
  'bun.lock': svgIcon(lockIcon),
  'bun.lockb': svgIcon(lockIcon),
  'yarn.lock': svgIcon(lockIcon),
  'pnpm-lock.yaml': svgIcon(lockIcon),
  '.eslintrc': svgIcon(eslintIcon),
  '.eslintrc.js': svgIcon(eslintIcon),
  '.eslintrc.json': svgIcon(eslintIcon),
  'eslint.config.js': svgIcon(eslintIcon),
  'eslint.config.mjs': svgIcon(eslintIcon),
  '.prettierrc': svgIcon(prettierIcon),
  '.prettierrc.json': svgIcon(prettierIcon),
  'prettier.config.js': svgIcon(prettierIcon),
  'flake.nix': svgIcon(nixIcon),
  'LICENSE': svgIcon(infoIcon),
  'README.md': svgIcon(bookIcon),
  'CHANGELOG.md': svgIcon(diffIcon),
  'Makefile': svgIcon(terminalIcon),
}

const FolderIcon = svgIcon(folderIcon)
const FolderOpenIcon = svgIcon(folderOpenIcon)
const DefaultIcon = svgIcon(fileIcon)

export function getFileIcon(
  filePath: string,
  isDir: boolean,
  isOpen?: boolean,
): FC<{ size?: number; color?: string; strokeWidth?: number }> {
  if (isDir) return isOpen ? FolderOpenIcon : FolderIcon
  const name = filePath.split('/').pop() ?? ''
  if (NAME_ICONS[name]) return NAME_ICONS[name]
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICONS[ext] ?? DefaultIcon
}
