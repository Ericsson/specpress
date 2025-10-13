# SpecPress

Export PDF and/or DOCX files from a subset of Markdown, ASN.1 and JSON files.

## System Requirements

SpecPress requires the following software to be installed on your system:

-   [Git](https://git-scm.com/)
-   [Node.js version 20+](https://nodejs.org/en)
-   [OpenJDK](https://openjdk.org/)

Additionally, if you eould like to use pandoc to convert mardown files into pdf or docx documents you need to install also:

-   [pandoc](https://pandoc.org/installing.html) by [John MacFarlane](https://johnmacfarlane.net/)
-   [MiKTeX](https://miktex.org/download) or [TeX Live](https://tug.org/texlive/) which include `pdflatex`

## Getting started

### Initialize your project

Create a folder in which, later on, you will clone your specifications git repositories, move into the folder and initialize `npm` by running the following commands in the terminal:

```
# create a new folder called for example "mySpecs"
mkdir mySpecs

# move into the folder
cd mySpecs

# initialize npm
npm init
```

### Install SpecPress

Install specpress as a development dependency of your project and initialize it with the following commands:

```
# install specpress
npm install specpress  --save-dev
# initialize specpress
npx sp_init
```

#### /mySpecs/specifications folder

As part of its initialization, sprecpress created the `specifications` folder in the projec’s root folder `mySpecs`. Use the `specifications` folder to store all your specifications git repositorues. For example, you can clone the git repository of your specification under the `specifications` folder.

```
# move into the specifications folder
cd specifications

# clone the git repository of your specification
# /mySpecs/specifications
git clone ssh://git@forge.3gpp.org:29419/fs_6gspecs_new/38423.git
```

If you want, you can rename the `specifications` folder to whatever name you like. Should you do so, you should also update the value of the `sourceFolderName` parameter in the `sp.config.json` file accordantly, e.g., `”sourceFolderName”: “yourPreferedName”`.

#### /mySpecs/sp.config.json file

The initialization process also publishes a configuration files `sp.config.json` in the root folder `/mySpecs/sp.config.json`.

```
#./sp.config.json
{
	"pathFiguresFolder": "/assets/figures",
	"sourceFolderName": "specifications"
}
```

Along with the `"sourceFolderName": "specifications"` parameter, this file contains the `”pathFiguresFolder": "/assets/figures"` parameter which indicates the in which subfolder of your specification specpress will save the `.png` files it generates for the UML sequence diagrams. The default value is `/assets/figures` so if you are working with the 38423 specification, the files will be saved in the `/mySpecs/specifications/38423/assets/figures` folder.
`

## Usage

Move now into your working directory which can be the `/specifications/38423` folder or a subfolder of `/pecifications/38423`.
In the working folder you can use the following specpress commands in the terminal:

### Export a .docx|.html|.pdf file

Specpress enables you to export a file which contains all the specification files from the working folder. The exported file will be saved in the `/mySpecs/export` folder.

```
# export a pdf file
npx sp_export pdf

# export a docx file
npx sp_export docx

# export a html file
npx sp_export html

# export a pdf file using pandoc
npx sp_export pdf pandoc

# export a docx file using pandoc
npx sp_export docx pandoc

# export a html file using
npx sp_export html pandoc
```

### Generate UML diagrams from text files using PlantUML

Specpress enables you to automatically generate `.png` files containing UML diagrams using as an input a text file containing a textual description of the UML diagram as presented in the example below:

```

#/mySpecs/specifications/38423/example.txt
@startuml
Alice -> Bob: Authentication Request
Boby --> Alice: Authentication Response
@enduml

```

The `.png` files are saved in the specification's subfolder indicated in the `sp.config.json` files.

```

# generale .png files for all the .txt files in the working folder
npx sp_generateUML

# generale .png file for a specific .txt file in the working folder
npx sp_generateUML-file ./example.txt

```

### Display the specification as a web page

Execute the following commands to display your specification as a webpage on your local http server:

```
#create the /mySpecs/public/index.html file
npx sp_publish

# start the http server from the /mySpecs/public folder
# the server is accessible at http://lcalhost:8080
npx sp_serve
```

### Watch for changes in your source files

```
npx sp_watch
```

The `sp_watch` command will:

-   watch for changes in your specification’s source files `[".asn", ".json", ".md"]` and update the `index.html` file according to your changes,
-   watch for changes in your UML sequence diagrams source files `[".puml", ".txt"]` and generate the corresponding PNG files in the `/mySpecs/specifications/38423/assets/figures` folder

### Start working on your specification

```
npx sp_start
```

The `sp_strat` command is equivalent to running the `sp_pubish`, `sp_watch` and `sp_serve` commands at once.

## Repository

[https://github.com/Ericsson/specpres](https://github.com/Ericsson/specpress)
