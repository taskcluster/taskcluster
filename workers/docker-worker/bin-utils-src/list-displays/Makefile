all: list-displays

list-displays: list-displays.c
	gcc -static -DNODEBUG -O3 -s $< -lX11 -lxcb -lXau -lXdmcp -lpthread -o $@

clean:
	rm -f list-displays
