# share-app-cli

share-app-cli is simply a wrapper around the `flutter run -release` command. It takes the extra step of allowing you to share your release apk files by uploading it to your google drive. It creates a `share-app` folder and the apk file is stored in that folder. It also updates the file everytime you create a release version with it.

# Install

To install run:
`npm install -g fards-share-app`
This installs it globally so you can use it in any directory

# Usage

Note: Make sure your target device is connected the normal way you do with `flutter run -release`

After installation, in the root folder of your flutter project run:
`fards-share-app bundle`

This builds your apk file and shows you the google drive link so you can share it.

To terminate the process press `ctrl + C`
