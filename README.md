# DEVELOPMENT

https://accountkit.alchemy.com/overview/getting-started.html

## Install dep

```
git clone git@github.com.....
cd script-erc4337-aa-alchemy-example
yarn install
```

## Prepare environment config

```
cp .env.example .env

# Update .env content
# Setup other secret configs as well
```

## Local dev

- Normal mode - without monitor

```
yarn start
```

- Monitor mode

```
yarn start:dev
```

## Build production

```
yarn build
```
