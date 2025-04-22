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

Create a folder for your specification, move into the folder and initialize `npm` by running the following commands in the terminal:

```
# create a new folder called for example "ts101"
mkdir ts101

# move into the folder
cd ts101

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

#### /ts101/src folder

As part of its initialization sprecpress created the `src` folder in the projec’s root folder `ts101`. Use the `src` folder to store all your specifications files, i.e., the: `.md, .json, .asn, .txt` files. Within the `src` folder you can create whatever structure of subfolder you like. You could also consider cloning a git repository containing you specification files under the `src` folder.

#### /ts101/sp.config.json file

The initialization process also publishes a configuration files `sp.config.json` in the root folder `/ts101/sp.config.json`. This files contains the `”pathFiguresFolder": "/assets/figures"` parameter which indicates the `src` subfolder where specpress will save the `.png` files it generates for the UML sequence diagrams. The default values is `/assets/figures` so the files will be saved in the `/ts101/src/assets/figures` folder. Before going any further, please make sure to set the value of `pathFiguresFolder` so that it points to the right `src` subfolder in your folder structure.
`

## Usage

Move now into your working directory which can be the `src` folder or a subfolder of `src`.
In the working folder you can use the following specpress commands in the terminal:

### Export a .docx|.html|.pdf file

Specpress enables you to export a file which contains all the specification files from the working folder. The exported file will be saved in the `/ts101/export` folder.

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

#/ts101/src/example.txt
@startuml
Alice -> Bob: Authentication Request
Boby --> Alice: Authentication Response
@enduml

```

The `.png` files are saved in the src subfolder indicated in the `sp.config.json` files.

```

# generale .png files for all the .txt files in the working folder
npx sp_generateUML

# generale .png file for a specific .txt file in the working folder
npx sp_generateUML-file ./example.txt

```

### Display the specification as a web page

Execute the following commands to display your specification as a webpage on your local http server:

```
#create the /ts101/public/index.html file
npx sp_publish

# start the http server from the /ts101/public folder
# the server is accessible at http://lcalhost:8080
npx sp_serve
```

### Watch for changes in your source files

```
npx sp_watch
```

The `sp_watch` command will:

-   watch for changes in your specification’s source files `[".asn", ".json", ".md"]` and update the `index.html` file according to your changes,
-   watch for changes in your UML sequence diagrams source files `[".puml", ".txt"]` and generate the corresponding PNG files in the `/ts101/src/assets/figures` folder

### Start working on your specification

```
npx sp_start
```

The `sp_strat` command is equivalent to running the `sp_pubish`, `sp_watch` and `sp_serve` commands at once.

## Repository

[https://github.com/Ericsson/specpres](https://github.com/Ericsson/specpress)
