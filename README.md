# Developer Contact Details
## Secure Communication with the Dev (Bryan aka gruvin)
Crypto is full of theives and trixters. I recommend sending me any queries via GPG signed and verified email. You can begin that process at my [FlowCrypt™ Encrypted Contact Page](https://flowcrypt.com/me/gruvin). 

At the very least, you'll be able to verify it was really me who replied, assuming you can use some kind of GPG enabled email client. I use the FlowCrypt™ exension for Gmail.

- Download my GPG Public Key *file* from my [FlowCrypt™ Encrypted Contact Page](https://flowcrypt.com/me/gruvin)

I use the same key to sign git tags (when I do) example: tag 0.2.0B (first open source release) is signed ...

- Import my public key into your GPG keyring ...

```
% gpg --import 0x8F351354BCBE9993-gruvingmailcom-public-key.asc
```
- Now you can see if a git tag is signed by me ...
```
% git tag --verify v0.2.0B
object a9662f470c35a28b1e3ca6301b08066ae82289ba
type commit
tag v0.2.0B
tagger Bryan <gruvin@gmail.com> 1590729834 +1200

Going Open Source.
gpg: Signature made Fri 29 May 17:23:54 2020 NZST
gpg:                using RSA key 036E2526A4740940E1DF91955751D33B09A27356
gpg: Good signature from "Bryan Rentoul <gruvin@gmail.com>" [ultimate]
```

----


This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.<br />
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br />
You will also see any lint errors in the console.

### `yarn test`

Launches the test runner in the interactive watch mode.<br />
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `yarn build`

Builds the app for production to the `build` folder.<br />
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br />
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: https://facebook.github.io/create-react-app/docs/code-splitting

### Analyzing the Bundle Size

This section has moved here: https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size

### Making a Progressive Web App

This section has moved here: https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app

### Advanced Configuration

This section has moved here: https://facebook.github.io/create-react-app/docs/advanced-configuration

### Deployment

This section has moved here: https://facebook.github.io/create-react-app/docs/deployment

### `yarn build` fails to minify

This section has moved here: https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify
