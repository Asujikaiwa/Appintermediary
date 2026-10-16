import { PROVINCES, provinceByCode } from "@yodkai/shared";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import {
  Button,
  Dialog,
  List,
  Portal,
  Searchbar,
  TextInput,
} from "react-native-paper";

interface Props {
  value: string | null;
  onChange: (code: string) => void;
}

/** Searchable picker over the 77 Thai provinces (ISO 3166-2:TH). */
export function ProvincePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROVINCES;
    return PROVINCES.filter(
      (p) => p.nameTh.includes(q) || p.nameEn.toLowerCase().includes(q),
    );
  }, [query]);

  const selected = value ? provinceByCode(value) : undefined;

  return (
    <>
      <TextInput
        mode="outlined"
        label="จังหวัด"
        value={selected?.nameTh ?? ""}
        editable={false}
        right={<TextInput.Icon icon="menu-down" onPress={() => setOpen(true)} />}
        onPressIn={() => setOpen(true)}
        testID="province-input"
      />
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={{ maxHeight: "80%" }}>
          <Dialog.Title>เลือกจังหวัด</Dialog.Title>
          <Dialog.Content style={{ paddingBottom: 0 }}>
            <Searchbar
              placeholder="ค้นหาจังหวัด"
              value={query}
              onChangeText={setQuery}
            />
          </Dialog.Content>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <FlatList
              data={filtered}
              keyExtractor={(p) => p.code}
              renderItem={({ item }) => (
                <List.Item
                  title={item.nameTh}
                  description={item.nameEn}
                  onPress={() => {
                    onChange(item.code);
                    setOpen(false);
                    setQuery("");
                  }}
                />
              )}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)}>ปิด</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}
