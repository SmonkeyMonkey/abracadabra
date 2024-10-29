#!/bin/sh

# EXAMPLE: ./test.sh --skip-devnet --skip-bentobox-tests

SKIP_LOCALNET=false # Use skip-localnet argument to skip run tests on localnet
SKIP_DEVNET=false # Use skip-devnet argument to skip run tests on devnet

SKIP_BENTOBOX_TESTS=false # Use skip-bentobox-tests argument to skip run bentobox tests
SKIP_CAULDRON_TESTS=false # Use skip-cauldron-tests argument to skip run cauldron tests

SKIP_DEPLOY=false # Use skip-deploy argument to skip deploy cauldron program on devnet

for ARG in $*; do
    if [ $ARG = "--skip-localnet" ]; then
        SKIP_LOCALNET=true
    fi
    if [ $ARG = "--skip-devnet" ]; then
       SKIP_DEVNET=true
    fi
    if [ $ARG = "--skip-bentobox-tests" ]; then
       SKIP_BENTOBOX_TESTS=true
    fi
    if [ $ARG = "--skip-cauldron-tests" ]; then
       SKIP_CAULDRON_TESTS=true
    fi
     if [ $ARG = "--skip-deploy" ]; then
       SKIP_DEPLOY=true
    fi
done

if [ $SKIP_LOCALNET = false ]; then
    echo "------------------------------------------------- Localnet... ------------------------------------------------------\n"
    export TESTS_CLUSTER="localnet"

    gnome-terminal -- solana-test-validator

    anchor build -p bentobox

    if [ $SKIP_BENTOBOX_TESTS = false ]; then
        echo "------------------------------------------------- Building bentobox... ------------------------------------------------------\n"
        anchor deploy -p bentobox --provider.cluster localnet --provider.wallet ~/.config/solana/id.json
        
        echo "------------------------------------------------- Run bentobox tests on localnet... -----------------------------------------------------\n"
        anchor run bentobox_localnet
    fi
    if [ $SKIP_CAULDRON_TESTS = false ]; then
        echo "------------------------------------------------- Building cauldron... ------------------------------------------------------\n"
        anchor build -p cauldron -- --features "localnet"
        anchor deploy -p cauldron --provider.cluster localnet --provider.wallet ~/.config/solana/id.json

        echo "------------------------------------------------- Run cauldron tests on localnet... -----------------------------------------------------\n"
        anchor run cauldron_localnet 
    fi
fi

if [ $SKIP_DEVNET = false ]; then
    echo "------------------------------------------------- Building bentobox ... ------------------------------------------------------\n"
    anchor build -p bentobox
    export TESTS_CLUSTER="devnet"

    if [ $SKIP_BENTOBOX_TESTS = false ]; then
        if [ $SKIP_DEPLOY = false ]; then
            echo "------------------------------------------------- Deploy bentobox on devnet ... ------------------------------------------------------\n"
            anchor deploy -p bentobox --provider.cluster devnet --provider.wallet $PWD/tests/wallets/devnet.json
        fi
        echo "------------------------------------------------- Run bentobox tests on devnet... -----------------------------------------------------\n"
        anchor run bentobox_devnet
    fi
    if [ $SKIP_CAULDRON_TESTS = false ]; then
        echo "------------------------------------------------- Building cauldron for devnet... ------------------------------------------------------\n"
        anchor build -p cauldron

        if [ $SKIP_DEPLOY = false ]; then
            echo "------------------------------------------------- Deploy cauldron on devnet... ------------------------------------------------------\n"
            echo $PWD
            anchor deploy -p cauldron --provider.cluster devnet --provider.wallet $PWD/tests/wallets/devnet.json
        fi
        
        echo "------------------------------------------------- Run cauldron tests on devnet... -----------------------------------------------------\n"
        anchor run cauldron_devnet 
    fi

    echo "\n------------------------------------------------- All done! -------------------------------------------------------------------"
fi