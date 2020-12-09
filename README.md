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

# How Can I Trust this dApp Interface?

Oh! I'm so glad you asked! Hold on to your hat! Here we go ...

## Self Service Security Audit
I'm just a lone guy, at the end of the Earth. I cannot hope to pay for any kind of proper code security audit. However, if you are so inclined, I have created a method for you to at least verify that what you get served over the web, matches what I have personally signed and published here on GitHub.

- You'll need GPG and to be competent at the command line.
- Download my GPG Public Key *file* from my [FlowCrypt™ Encrypted Contact Page](https://flowcrypt.com/me/gruvin)
- Import my public key into your GPG keyring ...
```
% gpg --import 0x8F351354BCBE9993-gruvingmailcom-public-key.asc
```
- Download the two `hexmob.win-*` files from the [latest release](https://github.com/gruvin/hexmob.win/releases/latest), which shouod be the current website version.
- Use the `.sig` file to verify the code is as it was when signed by the author (ME)
```
% gpg --verify hexmob.win-0.2.12B-build.tgz.sig hexmob.win-0.2.12B-build.tgz
gpg: Signature made Wed  9 Dec 14:10:31 2020 NZDT
gpg:                using RSA key 036E2526A4740940E1DF91955751D33B09A27356
gpg: Good signature from "Bryan Rentoul <gruvin@gmail.com>" [unknown]
```
- Now, you can use your browser's developer tools to check the code you are running matches the contents of the `.tgz` file.

# Self Service Code Audit
So, the code your browser gets matches what I wrote and intended. Yay! \0/ But ... is what I wrote fair and true? Well, that's where we reach the end of the road, I'm afraid. You'll either have to beg or pay someone to audit the code for you --OR-- at least look through it yourself, trying to find any ETH addresses other than the legitimate HEX ERC20 contract. That should be enough to know the code won't be sending your HEX off to somewhere you didn't want.

Here is how you can clone the code to your own computer and verifiy that what you got was what I actually wrote ...

```
% git clone https://github.com/gruvin/hexmob.win.git
% cd hexmob.win
% git checkout v0.2.12B    [or whatever the current version is]
% git tag --verify 0.2.12B            [ ditto]
object ab8d83bffd6774df5534e46523fa7310ac8772b0
type commit
tag 0.2.12B
tagger Bryan Rentoul <gruvin@gmail.com> 1607498555 +1300

0.12.B official release 2020-12-09 [<== this line might be anything]
gpg: Signature made Wed  9 Dec 20:23:30 2020 NZDT
gpg:                using RSA key 036E2526A4740940E1DF91955751D33B09A27356
gpg: Good signature from "Bryan Rentoul <gruvin@gmail.com>" [unknown]
```

Those `[unknown]` tags mean that no one you already trust has vouched for my GPG key. Sheesh! Let's try to keep it real though huh? 'k? Tnx.
